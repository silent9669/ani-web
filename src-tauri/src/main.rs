mod proxy;

use ani_desk_core::config::Config;
use ani_desk_core::db::{Database, WatchHistory};
use ani_desk_core::metadata::MetadataCache;
use ani_desk_core::player::Player;
use ani_desk_core::providers::{Anime, Episode, Language, ProviderRegistry, StreamInfo, Subtitle};
use anyhow::Context;
use chrono::Utc;
use proxy::ProxyState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Manager, State};

struct AppState {
    db: Arc<Database>,
    providers: ProviderRegistry,
    proxy: ProxyState,
    metadata: MetadataCache,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceDto {
    name: String,
    language: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnimeDto {
    id: String,
    provider: String,
    title: String,
    cover_url: String,
    banner_url: Option<String>,
    language: String,
    total_episodes: Option<u32>,
    synopsis: Option<String>,
    is_favorite: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnimeDetailsDto {
    cover_url: Option<String>,
    banner_url: Option<String>,
    total_episodes: Option<u32>,
    synopsis: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EpisodeDto {
    id: String,
    number: u32,
    title: Option<String>,
    thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchHistoryDto {
    anime_id: String,
    provider: String,
    title: String,
    cover_url: String,
    episode_number: u32,
    episode_title: Option<String>,
    position_seconds: u64,
    total_seconds: u64,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FavoriteDto {
    anime_id: String,
    provider: String,
    title: String,
    cover_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackDto {
    session_id: String,
    playback_url: String,
    original_url: String,
    stream_kind: String,
    subtitles: Vec<SubtitleDto>,
    qualities: Vec<String>,
    can_fallback_to_mpv: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubtitleDto {
    language: String,
    url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnimeInput {
    id: String,
    provider: String,
    title: String,
    cover_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProgressInput {
    anime_id: String,
    provider: String,
    title: String,
    cover_url: String,
    episode_number: u32,
    episode_title: Option<String>,
    position_seconds: u64,
    total_seconds: u64,
}

#[tauri::command]
async fn list_sources(state: State<'_, AppState>) -> Result<Vec<SourceDto>, String> {
    Ok(state
        .providers
        .list_providers()
        .iter()
        .map(|provider| SourceDto {
            name: provider.name().to_string(),
            language: language_label(provider.language()).to_string(),
        })
        .collect())
}

#[tauri::command]
async fn get_continue_watching(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<WatchHistoryDto>, String> {
    state
        .db
        .get_continue_watching(limit.unwrap_or(20))
        .await
        .map(|items| items.into_iter().map(map_history).collect())
        .map_err(to_string_error)
}

#[tauri::command]
async fn get_my_list(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<FavoriteDto>, String> {
    state
        .db
        .get_favorites(limit.unwrap_or(100))
        .await
        .map(|items| {
            items
                .into_iter()
                .map(|(anime_id, provider, title, cover_url)| FavoriteDto {
                    anime_id,
                    provider,
                    title,
                    cover_url,
                })
                .collect()
        })
        .map_err(to_string_error)
}

#[tauri::command]
async fn search_source(
    state: State<'_, AppState>,
    source: String,
    query: String,
) -> Result<Vec<AnimeDto>, String> {
    let query = query.trim().to_string();
    if query.len() < 2 {
        return Ok(Vec::new());
    }

    let provider = state
        .providers
        .get_provider(&source)
        .cloned()
        .ok_or_else(|| format!("Source '{}' is not available", source))?;

    let results = provider.search(&query).await.map_err(to_string_error)?;
    let mut mapped = Vec::with_capacity(results.len());
    for anime in results {
        let key = anime_key(&anime.provider, &anime.id);
        let is_favorite = state.db.is_favorite(&key).await.unwrap_or(false);
        mapped.push(map_anime(anime, is_favorite));
    }

    Ok(mapped)
}

#[tauri::command]
async fn get_anime_details(
    state: State<'_, AppState>,
    provider: String,
    anime_id: String,
    title: String,
) -> Result<AnimeDetailsDto, String> {
    let mut details = AnimeDetailsDto::default();

    if let Some(provider_ref) = state.providers.get_provider(&provider).cloned() {
        match provider_ref.get_anime_details(&anime_id).await {
            Ok(Some(anime)) => {
                details.cover_url = non_empty(anime.cover_url);
                details.banner_url = anime.banner_url.and_then(non_empty);
                details.total_episodes = anime.total_episodes;
                details.synopsis = anime.synopsis.and_then(non_empty);
            }
            Ok(None) => {}
            Err(error) => {
                tracing::warn!(
                    "Provider detail lookup failed for {}:{}: {}",
                    provider,
                    anime_id,
                    error
                );
            }
        }
    }

    if details.synopsis.is_none() || details.banner_url.is_none() || details.cover_url.is_none() {
        match state.metadata.search_and_cache(title.trim()).await {
            Ok(metadata) => {
                if let Some(metadata) = metadata.into_iter().next() {
                    if details.synopsis.is_none() {
                        details.synopsis = metadata.description.and_then(non_empty);
                    }
                    if details.banner_url.is_none() {
                        details.banner_url = metadata.banner_url.and_then(non_empty);
                    }
                    if details.cover_url.is_none() {
                        details.cover_url = metadata.cover_url.and_then(non_empty);
                    }
                    if details.total_episodes.is_none() {
                        details.total_episodes = metadata
                            .episode_count
                            .and_then(|count| u32::try_from(count).ok());
                    }
                }
            }
            Err(error) => {
                tracing::warn!("AniList detail fallback failed for '{}': {}", title, error);
            }
        }
    }

    Ok(details)
}

#[tauri::command]
async fn get_episodes(
    state: State<'_, AppState>,
    provider: String,
    anime_id: String,
) -> Result<Vec<EpisodeDto>, String> {
    let provider = state
        .providers
        .get_provider(&provider)
        .cloned()
        .ok_or_else(|| format!("Provider '{}' is not available", provider))?;

    provider
        .get_episodes(&anime_id)
        .await
        .map(|episodes| episodes.into_iter().map(map_episode).collect())
        .map_err(to_string_error)
}

#[tauri::command]
async fn prepare_playback(
    state: State<'_, AppState>,
    provider: String,
    episode_id: String,
) -> Result<PlaybackDto, String> {
    let stream = resolve_stream(&state, &provider, &episode_id).await?;
    let stream_kind = playback_stream_kind(&stream.video_url).to_string();
    let session = state
        .proxy
        .create_session(&stream)
        .await
        .map_err(to_string_error)?;

    Ok(PlaybackDto {
        session_id: session.session_id,
        playback_url: session.playback_url,
        original_url: stream.video_url,
        stream_kind,
        subtitles: stream.subtitles.into_iter().map(map_subtitle).collect(),
        qualities: stream.qualities,
        can_fallback_to_mpv: true,
    })
}

#[tauri::command]
async fn open_in_mpv(
    state: State<'_, AppState>,
    provider: String,
    episode_id: String,
    start_time: Option<u64>,
) -> Result<(), String> {
    let stream = resolve_stream(&state, &provider, &episode_id).await?;
    Player::new()
        .start_detached(
            &stream.video_url,
            &stream.subtitles,
            &stream.headers,
            start_time,
        )
        .map_err(to_string_error)
}

#[tauri::command]
async fn save_progress(state: State<'_, AppState>, progress: ProgressInput) -> Result<(), String> {
    let history = WatchHistory {
        anime_id: progress.anime_id,
        provider: progress.provider,
        title: progress.title,
        cover_url: progress.cover_url,
        episode_number: progress.episode_number,
        episode_title: progress.episode_title,
        position_seconds: progress.position_seconds,
        total_seconds: progress.total_seconds,
        updated_at: Utc::now(),
    };

    state
        .db
        .save_watch_history(&history)
        .await
        .map_err(to_string_error)
}

#[tauri::command]
async fn add_to_my_list(state: State<'_, AppState>, anime: AnimeInput) -> Result<(), String> {
    let key = anime_key(&anime.provider, &anime.id);
    state
        .db
        .save_favorite(&key, &anime.provider, &anime.title, &anime.cover_url)
        .await
        .map_err(to_string_error)
}

#[tauri::command]
async fn remove_from_my_list(state: State<'_, AppState>, anime_id: String) -> Result<(), String> {
    state
        .db
        .remove_favorite(&anime_id)
        .await
        .map_err(to_string_error)
}

#[tauri::command]
async fn remove_continue_watching(
    state: State<'_, AppState>,
    anime_id: String,
) -> Result<(), String> {
    state
        .db
        .remove_from_continue_watching(&anime_id)
        .await
        .map_err(to_string_error)
}

async fn resolve_stream(
    state: &AppState,
    provider: &str,
    episode_id: &str,
) -> Result<StreamInfo, String> {
    let provider_ref = state
        .providers
        .get_provider(provider)
        .cloned()
        .ok_or_else(|| format!("Provider '{}' is not available", provider))?;

    provider_ref
        .get_stream_url(episode_id)
        .await
        .map_err(to_string_error)
}

fn map_anime(anime: Anime, is_favorite: bool) -> AnimeDto {
    AnimeDto {
        id: anime.id,
        provider: anime.provider,
        title: anime.title,
        cover_url: anime.cover_url,
        banner_url: anime.banner_url,
        language: language_label(anime.language).to_string(),
        total_episodes: anime.total_episodes,
        synopsis: anime.synopsis,
        is_favorite,
    }
}

fn map_episode(episode: Episode) -> EpisodeDto {
    EpisodeDto {
        id: episode.id,
        number: episode.number,
        title: episode.title,
        thumbnail: episode.thumbnail,
    }
}

fn map_history(history: WatchHistory) -> WatchHistoryDto {
    WatchHistoryDto {
        anime_id: history.anime_id,
        provider: history.provider,
        title: history.title,
        cover_url: history.cover_url,
        episode_number: history.episode_number,
        episode_title: history.episode_title,
        position_seconds: history.position_seconds,
        total_seconds: history.total_seconds,
        updated_at: history.updated_at.to_rfc3339(),
    }
}

fn map_subtitle(subtitle: Subtitle) -> SubtitleDto {
    SubtitleDto {
        language: subtitle.language,
        url: subtitle.url,
    }
}

fn playback_stream_kind(url: &str) -> &'static str {
    if url.to_ascii_lowercase().contains(".m3u8") {
        "hls"
    } else {
        "native"
    }
}

fn language_label(language: Language) -> &'static str {
    match language {
        Language::English => "English",
        Language::Vietnamese => "Vietnamese",
    }
}

fn anime_key(provider: &str, anime_id: &str) -> String {
    format!("{}:{}", provider, anime_id)
}

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn to_string_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn main() {
    tracing_subscriber::fmt::init();

    let builder = tauri::Builder::default().plugin(tauri_plugin_process::init());

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            let config = Config::load().context("Failed to load ani-desk config")?;
            config.validate().context("Invalid ani-desk config")?;
            let db = tauri::async_runtime::block_on(Database::new())
                .context("Failed to open ani-desk database")?;
            let db = Arc::new(db);
            let providers = ProviderRegistry::new(&config);
            let proxy = tauri::async_runtime::block_on(ProxyState::start())
                .context("Failed to start playback proxy")?;
            let metadata = MetadataCache::new(db.clone());

            app.manage(AppState {
                db,
                providers,
                proxy,
                metadata,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_sources,
            get_continue_watching,
            get_my_list,
            search_source,
            get_anime_details,
            get_episodes,
            prepare_playback,
            open_in_mpv,
            save_progress,
            add_to_my_list,
            remove_from_my_list,
            remove_continue_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ani-desk");
}
