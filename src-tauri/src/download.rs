use ani_desk_core::providers::StreamInfo;
use anyhow::{bail, Context, Result};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub provider: String,
    pub episode_id: String,
    pub anime_title: String,
    pub episode_number: u32,
    pub episode_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub file_path: String,
    pub file_name: String,
    pub bytes_downloaded: u64,
    pub media_kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadEvent {
    pub event: String,
    pub progress: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub completed_segments: Option<usize>,
    pub total_segments: Option<usize>,
    pub file_name: Option<String>,
}

struct MediaPlaylist {
    initialization: Option<Url>,
    segments: Vec<Url>,
}

pub async fn download_episode(
    app: &AppHandle,
    stream: &StreamInfo,
    request: &DownloadRequest,
    on_event: &Channel<DownloadEvent>,
) -> Result<DownloadResult> {
    let source_url = Url::parse(&stream.video_url).context("Stream URL is invalid")?;
    let source_path = source_url.path().to_ascii_lowercase();
    if source_path.contains(".mpd") {
        bail!("DASH downloads are not supported by this provider yet");
    }

    let client = build_client(stream)?;
    let is_hls = source_path.contains(".m3u8");
    let extension = if is_hls {
        "ts"
    } else {
        direct_media_extension(source_url.path())
    };
    let destination = destination_path(app, request, extension).await?;
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("ani-desk-download")
        .to_string();
    let partial = partial_path(&destination);

    send_event(
        on_event,
        DownloadEvent {
            event: "started".into(),
            progress: 0.0,
            downloaded_bytes: 0,
            total_bytes: None,
            completed_segments: None,
            total_segments: None,
            file_name: Some(file_name.clone()),
        },
    );

    let outcome = if is_hls {
        download_hls(&client, source_url, &partial, on_event).await
    } else {
        download_direct(&client, source_url, &partial, on_event).await
    };

    let bytes_downloaded = match outcome {
        Ok(bytes) => bytes,
        Err(error) => {
            let _ = fs::remove_file(&partial).await;
            return Err(error);
        }
    };

    fs::rename(&partial, &destination)
        .await
        .with_context(|| format!("Could not finish {}", destination.display()))?;

    send_event(
        on_event,
        DownloadEvent {
            event: "finished".into(),
            progress: 100.0,
            downloaded_bytes: bytes_downloaded,
            total_bytes: Some(bytes_downloaded),
            completed_segments: None,
            total_segments: None,
            file_name: Some(file_name.clone()),
        },
    );

    Ok(DownloadResult {
        file_path: destination.to_string_lossy().into_owned(),
        file_name,
        bytes_downloaded,
        media_kind: if is_hls { "hls-ts" } else { "direct" }.into(),
    })
}

fn build_client(stream: &StreamInfo) -> Result<Client> {
    let mut headers = HeaderMap::new();
    for (name, value) in &stream.headers {
        headers.insert(
            HeaderName::from_bytes(name.as_bytes()).context("Invalid stream header name")?,
            HeaderValue::from_str(value).context("Invalid stream header value")?,
        );
    }

    let allow_invalid_certs = stream.video_url.contains("mp4upload.com");
    Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .default_headers(headers)
        .danger_accept_invalid_certs(allow_invalid_certs)
        .build()
        .context("Could not create the download client")
}

async fn download_direct(
    client: &Client,
    url: Url,
    partial: &Path,
    on_event: &Channel<DownloadEvent>,
) -> Result<u64> {
    let mut response = client
        .get(url)
        .send()
        .await
        .context("Direct media download failed")?
        .error_for_status()
        .context("The media host rejected the download")?;
    let total = response.content_length();
    let mut file = File::create(partial)
        .await
        .with_context(|| format!("Could not create {}", partial.display()))?;
    let mut downloaded = 0_u64;

    while let Some(chunk) = response
        .chunk()
        .await
        .context("Media download was interrupted")?
    {
        file.write_all(&chunk)
            .await
            .context("Could not write the media file")?;
        downloaded += chunk.len() as u64;
        send_event(
            on_event,
            DownloadEvent {
                event: "progress".into(),
                progress: total
                    .filter(|value| *value > 0)
                    .map(|value| downloaded as f64 / value as f64 * 100.0)
                    .unwrap_or(0.0),
                downloaded_bytes: downloaded,
                total_bytes: total,
                completed_segments: None,
                total_segments: None,
                file_name: None,
            },
        );
    }

    file.flush()
        .await
        .context("Could not flush the media file")?;
    Ok(downloaded)
}

async fn download_hls(
    client: &Client,
    source_url: Url,
    partial: &Path,
    on_event: &Channel<DownloadEvent>,
) -> Result<u64> {
    let playlist = resolve_media_playlist(client, source_url).await?;
    let mut file = File::create(partial)
        .await
        .with_context(|| format!("Could not create {}", partial.display()))?;
    let total_segments = playlist.segments.len();
    let mut downloaded = 0_u64;

    if let Some(initialization) = playlist.initialization {
        let bytes = fetch_bytes(client, initialization, "HLS initialization segment").await?;
        file.write_all(&bytes)
            .await
            .context("Could not write the HLS initialization segment")?;
        downloaded += bytes.len() as u64;
    }

    for (index, segment) in playlist.segments.into_iter().enumerate() {
        let bytes = fetch_bytes(client, segment, "HLS media segment").await?;
        file.write_all(&bytes)
            .await
            .context("Could not write an HLS media segment")?;
        downloaded += bytes.len() as u64;
        let completed = index + 1;
        send_event(
            on_event,
            DownloadEvent {
                event: "progress".into(),
                progress: completed as f64 / total_segments as f64 * 100.0,
                downloaded_bytes: downloaded,
                total_bytes: None,
                completed_segments: Some(completed),
                total_segments: Some(total_segments),
                file_name: None,
            },
        );
    }

    file.flush()
        .await
        .context("Could not flush the HLS media file")?;
    Ok(downloaded)
}

async fn resolve_media_playlist(client: &Client, source_url: Url) -> Result<MediaPlaylist> {
    let mut playlist_url = source_url;
    let mut body = fetch_text(client, playlist_url.clone()).await?;

    for _ in 0..3 {
        let Some(variant) = highest_bandwidth_variant(&playlist_url, &body)? else {
            break;
        };
        playlist_url = variant;
        body = fetch_text(client, playlist_url.clone()).await?;
    }

    if body.lines().any(|line| {
        let line = line.trim().to_ascii_uppercase();
        line.starts_with("#EXT-X-KEY") && !line.contains("METHOD=NONE")
    }) {
        bail!("Encrypted HLS downloads are not supported by this provider yet");
    }
    if body
        .lines()
        .any(|line| line.trim().starts_with("#EXT-X-BYTERANGE"))
    {
        bail!("Byte-range HLS downloads are not supported by this provider yet");
    }

    let initialization = body
        .lines()
        .find_map(|line| parse_map_uri(line.trim()))
        .map(|value| join_playlist_url(&playlist_url, &value))
        .transpose()?;
    let segments = body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| join_playlist_url(&playlist_url, line))
        .collect::<Result<Vec<_>>>()?;

    if segments.is_empty() {
        bail!("The HLS playlist did not contain downloadable media segments");
    }

    Ok(MediaPlaylist {
        initialization,
        segments,
    })
}

fn highest_bandwidth_variant(base: &Url, body: &str) -> Result<Option<Url>> {
    let mut pending_bandwidth = None;
    let mut variants = Vec::new();

    for line in body.lines().map(str::trim) {
        if line.starts_with("#EXT-X-STREAM-INF") {
            pending_bandwidth = Some(parse_bandwidth(line));
        } else if !line.is_empty() && !line.starts_with('#') {
            if let Some(bandwidth) = pending_bandwidth.take() {
                variants.push((bandwidth, join_playlist_url(base, line)?));
            }
        }
    }

    variants.sort_by_key(|(bandwidth, _)| *bandwidth);
    Ok(variants.pop().map(|(_, url)| url))
}

fn parse_bandwidth(line: &str) -> u64 {
    line.split(',')
        .find_map(|part| part.trim().strip_prefix("BANDWIDTH="))
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

fn parse_map_uri(line: &str) -> Option<String> {
    let attributes = line.strip_prefix("#EXT-X-MAP:")?;
    let uri = attributes
        .split(',')
        .find_map(|part| part.trim().strip_prefix("URI="))?;
    Some(uri.trim_matches('"').to_string())
}

fn join_playlist_url(base: &Url, value: &str) -> Result<Url> {
    base.join(value)
        .with_context(|| format!("Invalid HLS resource URL in {}", base))
}

async fn fetch_text(client: &Client, url: Url) -> Result<String> {
    client
        .get(url)
        .send()
        .await
        .context("Could not fetch the HLS playlist")?
        .error_for_status()
        .context("The HLS host rejected the playlist request")?
        .text()
        .await
        .context("Could not read the HLS playlist")
}

async fn fetch_bytes(client: &Client, url: Url, label: &str) -> Result<Vec<u8>> {
    Ok(client
        .get(url)
        .send()
        .await
        .with_context(|| format!("Could not fetch {label}"))?
        .error_for_status()
        .with_context(|| format!("The media host rejected an {label} request"))?
        .bytes()
        .await
        .with_context(|| format!("Could not read {label}"))?
        .to_vec())
}

async fn destination_path(
    app: &AppHandle,
    request: &DownloadRequest,
    extension: &str,
) -> Result<PathBuf> {
    let root = app
        .path()
        .download_dir()
        .context("The system Downloads folder is unavailable")?
        .join("ani-desk")
        .join(sanitize_file_component(&request.anime_title));
    fs::create_dir_all(&root)
        .await
        .with_context(|| format!("Could not create {}", root.display()))?;

    let episode_title = request
        .episode_title
        .as_deref()
        .filter(|title| !title.trim().is_empty())
        .map(sanitize_file_component);
    let stem = match episode_title {
        Some(title) if title != format!("Episode {}", request.episode_number) => {
            format!("E{:02} - {}", request.episode_number, title)
        }
        _ => format!("Episode {:02}", request.episode_number),
    };

    unique_path(&root, &stem, extension).await
}

async fn unique_path(directory: &Path, stem: &str, extension: &str) -> Result<PathBuf> {
    for suffix in 0..10_000_u32 {
        let name = if suffix == 0 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem} ({suffix}).{extension}")
        };
        let candidate = directory.join(name);
        if !fs::try_exists(&candidate)
            .await
            .with_context(|| format!("Could not inspect {}", candidate.display()))?
        {
            return Ok(candidate);
        }
    }
    bail!("Could not choose a unique download file name")
}

fn partial_path(destination: &Path) -> PathBuf {
    let mut value = destination.as_os_str().to_os_string();
    value.push(".part");
    PathBuf::from(value)
}

fn sanitize_file_component(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.') {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(['.', ' '])
        .chars()
        .take(120)
        .collect::<String>();

    if cleaned.is_empty() {
        "ani-desk".into()
    } else {
        cleaned
    }
}

fn direct_media_extension(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".webm") {
        "webm"
    } else if lower.ends_with(".mkv") {
        "mkv"
    } else {
        "mp4"
    }
}

fn send_event(channel: &Channel<DownloadEvent>, event: DownloadEvent) {
    let _ = channel.send(event);
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::get, Router};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn selects_highest_bandwidth_hls_variant() {
        let base = Url::parse("https://cdn.example/master/index.m3u8").unwrap();
        let body = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3500000\nhigh/index.m3u8\n";
        let selected = highest_bandwidth_variant(&base, body).unwrap().unwrap();
        assert_eq!(
            selected.as_str(),
            "https://cdn.example/master/high/index.m3u8"
        );
    }

    #[test]
    fn sanitizes_cross_platform_file_names() {
        assert_eq!(
            sanitize_file_component("One Piece: Episode 1 / The Start?"),
            "One Piece Episode 1 The Start"
        );
        assert_eq!(sanitize_file_component("..."), "ani-desk");
    }

    #[test]
    fn parses_hls_initialization_map() {
        assert_eq!(
            parse_map_uri("#EXT-X-MAP:URI=\"init.mp4\",BYTERANGE=\"1000@0\""),
            Some("init.mp4".into())
        );
    }

    #[tokio::test]
    async fn assembles_local_hls_segments_in_playlist_order() {
        let router = Router::new()
            .route(
                "/master.m3u8",
                get(|| async { "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000\nmedia.m3u8\n" }),
            )
            .route(
                "/media.m3u8",
                get(|| async { "#EXTM3U\n#EXTINF:2,\nfirst.ts\n#EXTINF:2,\nsecond.ts\n" }),
            )
            .route("/first.ts", get(|| async { vec![1_u8, 2, 3] }))
            .route("/second.ts", get(|| async { vec![4_u8, 5, 6] }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let destination = std::env::temp_dir().join(format!("ani-desk-hls-{suffix}.ts.part"));
        let channel = Channel::<DownloadEvent>::new(|_| Ok(()));

        let downloaded = download_hls(
            &Client::new(),
            Url::parse(&format!("http://{address}/master.m3u8")).unwrap(),
            &destination,
            &channel,
        )
        .await
        .unwrap();
        let assembled = fs::read(&destination).await.unwrap();

        assert_eq!(downloaded, 6);
        assert_eq!(assembled, vec![1, 2, 3, 4, 5, 6]);
        let _ = fs::remove_file(destination).await;
        server.abort();
    }
}
