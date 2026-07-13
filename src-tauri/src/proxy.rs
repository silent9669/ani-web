use ani_desk_core::providers::StreamInfo;
use anyhow::{Context, Result};
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header as axum_header, HeaderMap, HeaderName, HeaderValue, Response, StatusCode};
use axum::routing::get;
use axum::Router;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use reqwest::{header as reqwest_header, Client};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use url::Url;
use uuid::Uuid;

#[derive(Clone)]
pub struct ProxyState {
    base_url: String,
    client: Client,
    insecure_client: Client,
    sessions: Arc<RwLock<HashMap<String, ProxySession>>>,
}

#[derive(Clone)]
struct ProxySession {
    stream_url: String,
    headers: HashMap<String, String>,
    allow_invalid_certs: bool,
}

pub struct PlaybackSession {
    pub session_id: String,
    pub playback_url: String,
}

#[derive(Debug, Deserialize)]
struct ResourceQuery {
    url: String,
}

impl ProxyState {
    pub async fn start() -> Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .context("Failed to bind playback proxy")?;
        let addr = listener
            .local_addr()
            .context("Failed to read proxy address")?;
        let state = Self {
            base_url: format!("http://{}", addr),
            client: Client::builder()
                .redirect(reqwest::redirect::Policy::limited(10))
                .build()
                .context("Failed to create proxy HTTP client")?,
            insecure_client: Client::builder()
                .redirect(reqwest::redirect::Policy::limited(10))
                .danger_accept_invalid_certs(true)
                .build()
                .context("Failed to create fallback proxy HTTP client")?,
            sessions: Arc::new(RwLock::new(HashMap::new())),
        };

        let app = Router::new()
            .route("/play/:session_id", get(play_session))
            .route("/resource/:session_id", get(play_resource))
            .route("/dash/:session_id/*path", get(play_dash_resource))
            .layer(
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any),
            )
            .with_state(state.clone());

        tauri::async_runtime::spawn(async move {
            if let Err(error) = axum::serve(listener, app).await {
                tracing::error!("Playback proxy stopped: {}", error);
            }
        });

        Ok(state)
    }

    pub async fn create_session(&self, stream: &StreamInfo) -> Result<PlaybackSession> {
        if stream.video_url.trim().is_empty() {
            anyhow::bail!("Cannot proxy an empty stream URL");
        }

        let session_id = Uuid::new_v4().to_string();
        let playback_url = format!("{}/play/{}", self.base_url, session_id);
        self.sessions.write().await.insert(
            session_id.clone(),
            ProxySession {
                stream_url: stream.video_url.clone(),
                headers: stream.headers.clone(),
                allow_invalid_certs: requires_insecure_tls(stream),
            },
        );

        Ok(PlaybackSession {
            session_id,
            playback_url,
        })
    }
}

async fn play_session(
    State(state): State<ProxyState>,
    Path(session_id): Path<String>,
    incoming_headers: HeaderMap,
) -> Response<Body> {
    let Some(session) = state.sessions.read().await.get(&session_id).cloned() else {
        return text_response(StatusCode::NOT_FOUND, "Playback session not found");
    };

    proxy_url(
        &state,
        &session_id,
        &session,
        &session.stream_url,
        &incoming_headers,
    )
    .await
}

async fn play_resource(
    State(state): State<ProxyState>,
    Path(session_id): Path<String>,
    Query(query): Query<ResourceQuery>,
    incoming_headers: HeaderMap,
) -> Response<Body> {
    let Some(session) = state.sessions.read().await.get(&session_id).cloned() else {
        return text_response(StatusCode::NOT_FOUND, "Playback session not found");
    };

    proxy_url(&state, &session_id, &session, &query.url, &incoming_headers).await
}

async fn play_dash_resource(
    State(state): State<ProxyState>,
    Path((session_id, path)): Path<(String, String)>,
    incoming_headers: HeaderMap,
) -> Response<Body> {
    let Some(session) = state.sessions.read().await.get(&session_id).cloned() else {
        return text_response(StatusCode::NOT_FOUND, "Playback session not found");
    };
    let Some((encoded_base, relative_path)) = path
        .strip_prefix("base/")
        .and_then(|value| value.split_once('/').or(Some((value, ""))))
    else {
        return text_response(StatusCode::BAD_REQUEST, "Invalid DASH resource path");
    };
    let Ok(base_bytes) = URL_SAFE_NO_PAD.decode(encoded_base) else {
        return text_response(StatusCode::BAD_REQUEST, "Invalid DASH resource base");
    };
    let Ok(base_url) = String::from_utf8(base_bytes) else {
        return text_response(StatusCode::BAD_REQUEST, "Invalid DASH resource encoding");
    };
    let Ok(base) = Url::parse(&base_url) else {
        return text_response(StatusCode::BAD_REQUEST, "Invalid DASH upstream URL");
    };
    let upstream = if relative_path.is_empty() {
        base.to_string()
    } else {
        match base.join(relative_path) {
            Ok(url) => url.to_string(),
            Err(_) => {
                return text_response(StatusCode::BAD_REQUEST, "Invalid DASH relative URL");
            }
        }
    };
    proxy_url(&state, &session_id, &session, &upstream, &incoming_headers).await
}

async fn proxy_url(
    state: &ProxyState,
    session_id: &str,
    session: &ProxySession,
    url: &str,
    incoming_headers: &HeaderMap,
) -> Response<Body> {
    let client = if session.allow_invalid_certs {
        &state.insecure_client
    } else {
        &state.client
    };
    let mut request = client.get(url);
    for (key, value) in &session.headers {
        request = request.header(key.as_str(), value.as_str());
    }
    request = request.header(reqwest_header::ACCEPT_ENCODING, "identity");

    for header_name in [axum_header::RANGE, axum_header::IF_RANGE] {
        if let Some(value) = incoming_headers
            .get(header_name.as_str())
            .and_then(|value| value.to_str().ok())
        {
            request = request.header(header_name.as_str(), value);
        }
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return text_response(
                StatusCode::BAD_GATEWAY,
                &format!("Failed to fetch upstream stream: {}", error),
            );
        }
    };

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::OK);
    let content_type = response
        .headers()
        .get(reqwest_header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    let upstream_headers = response.headers().clone();

    if is_hls_playlist(url, &content_type) {
        let bytes = match response.bytes().await {
            Ok(bytes) => bytes,
            Err(error) => {
                return text_response(
                    StatusCode::BAD_GATEWAY,
                    &format!("Failed to read upstream stream: {}", error),
                );
            }
        };

        let playlist = String::from_utf8_lossy(&bytes);
        let rewritten = rewrite_playlist(&state.base_url, session_id, url, &playlist);
        return response_with_body(
            status,
            "application/vnd.apple.mpegurl; charset=utf-8",
            Body::from(rewritten),
        );
    }

    if is_dash_manifest(url, &content_type) {
        let bytes = match response.bytes().await {
            Ok(bytes) => bytes,
            Err(error) => {
                return text_response(
                    StatusCode::BAD_GATEWAY,
                    &format!("Failed to read upstream DASH manifest: {}", error),
                );
            }
        };
        let manifest = String::from_utf8_lossy(&bytes);
        let rewritten = rewrite_dash_manifest(&state.base_url, session_id, url, &manifest);
        return response_with_body(
            status,
            "application/dash+xml; charset=utf-8",
            Body::from(rewritten),
        );
    }

    response_with_stream(
        status,
        &upstream_headers,
        if content_type.is_empty() {
            "application/octet-stream"
        } else {
            &content_type
        },
        Body::from_stream(response.bytes_stream()),
    )
}

fn requires_insecure_tls(stream: &StreamInfo) -> bool {
    stream.video_url.contains("mp4upload.com")
        || stream.headers.values().any(|value| {
            Url::parse(value)
                .ok()
                .and_then(|url| url.host_str().map(str::to_owned))
                .is_some_and(|host| host == "mp4upload.com" || host.ends_with(".mp4upload.com"))
        })
}

fn rewrite_playlist(
    base_url: &str,
    session_id: &str,
    playlist_url: &str,
    playlist: &str,
) -> String {
    let base = Url::parse(playlist_url).ok();
    playlist
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                String::new()
            } else if trimmed.starts_with("#EXT-X-KEY") || trimmed.starts_with("#EXT-X-MAP") {
                rewrite_quoted_uri(base_url, session_id, base.as_ref(), line)
            } else if trimmed.starts_with('#') {
                line.to_string()
            } else {
                to_proxy_url(base_url, session_id, base.as_ref(), trimmed)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn rewrite_quoted_uri(base_url: &str, session_id: &str, base: Option<&Url>, line: &str) -> String {
    let Some(start) = line.find("URI=\"") else {
        return line.to_string();
    };
    let uri_start = start + 5;
    let Some(relative_end) = line[uri_start..].find('"') else {
        return line.to_string();
    };
    let uri_end = uri_start + relative_end;
    let original_uri = &line[uri_start..uri_end];
    let rewritten = to_proxy_url(base_url, session_id, base, original_uri);
    format!("{}{}{}", &line[..uri_start], rewritten, &line[uri_end..])
}

fn to_proxy_url(base_url: &str, session_id: &str, base: Option<&Url>, value: &str) -> String {
    let absolute = match Url::parse(value) {
        Ok(url) => url.to_string(),
        Err(_) => base
            .and_then(|base| base.join(value).ok())
            .map(|url| url.to_string())
            .unwrap_or_else(|| value.to_string()),
    };
    let encoded: String = url::form_urlencoded::byte_serialize(absolute.as_bytes()).collect();
    format!("{}/resource/{}?url={}", base_url, session_id, encoded)
}

fn is_hls_playlist(url: &str, content_type: &str) -> bool {
    let content_type = content_type.to_ascii_lowercase();
    url.to_ascii_lowercase().contains(".m3u8")
        || content_type.contains("mpegurl")
        || content_type.contains("application/vnd.apple")
}

fn is_dash_manifest(url: &str, content_type: &str) -> bool {
    let content_type = content_type.to_ascii_lowercase();
    url.to_ascii_lowercase().contains(".mpd") || content_type.contains("dash+xml")
}

fn rewrite_dash_manifest(
    proxy_base_url: &str,
    session_id: &str,
    manifest_url: &str,
    manifest: &str,
) -> String {
    let Ok(manifest_base) = Url::parse(manifest_url) else {
        return manifest.to_string();
    };
    let mut output = String::with_capacity(manifest.len() + 128);
    let mut remaining = manifest;
    let mut found_base = false;
    while let Some(start) = remaining.find("<BaseURL") {
        let Some(open_end_relative) = remaining[start..].find('>') else {
            break;
        };
        let open_end = start + open_end_relative + 1;
        let Some(close_relative) = remaining[open_end..].find("</BaseURL>") else {
            break;
        };
        let close = open_end + close_relative;
        output.push_str(&remaining[..open_end]);
        let original = remaining[open_end..close].trim();
        let absolute = manifest_base
            .join(original)
            .unwrap_or_else(|_| manifest_base.clone());
        output.push_str(&dash_proxy_base(proxy_base_url, session_id, &absolute));
        output.push_str("</BaseURL>");
        remaining = &remaining[close + "</BaseURL>".len()..];
        found_base = true;
    }
    output.push_str(remaining);

    if found_base {
        return output;
    }
    let mut rewritten = output;
    if let Some(mpd_start) = rewritten.find("<MPD") {
        if let Some(relative_end) = rewritten[mpd_start..].find('>') {
            let insert_at = mpd_start + relative_end + 1;
            let parent = manifest_base.join(".").unwrap_or(manifest_base);
            rewritten.insert_str(
                insert_at,
                &format!(
                    "<BaseURL>{}</BaseURL>",
                    dash_proxy_base(proxy_base_url, session_id, &parent)
                ),
            );
        }
    }
    rewritten
}

fn dash_proxy_base(proxy_base_url: &str, session_id: &str, upstream_base: &Url) -> String {
    let encoded = URL_SAFE_NO_PAD.encode(upstream_base.as_str());
    format!("{proxy_base_url}/dash/{session_id}/base/{encoded}/")
}

fn response_with_body(status: StatusCode, content_type: &str, body: Body) -> Response<Body> {
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(content_type) {
        headers.insert(axum_header::CONTENT_TYPE, value);
    }

    let mut response = Response::new(body);
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    response
}

fn response_with_stream(
    status: StatusCode,
    upstream_headers: &reqwest_header::HeaderMap,
    content_type: &str,
    body: Body,
) -> Response<Body> {
    let mut response = response_with_body(status, content_type, body);
    for name in [
        "accept-ranges",
        "content-length",
        "content-range",
        "cache-control",
        "etag",
        "last-modified",
    ] {
        copy_upstream_header(response.headers_mut(), upstream_headers, name);
    }
    response
}

fn copy_upstream_header(
    outgoing: &mut HeaderMap,
    upstream_headers: &reqwest_header::HeaderMap,
    name: &str,
) {
    let Some(value) = upstream_headers
        .get(name)
        .and_then(|value| value.to_str().ok())
    else {
        return;
    };

    let Ok(header_name) = HeaderName::from_bytes(name.as_bytes()) else {
        return;
    };
    let Ok(header_value) = HeaderValue::from_str(value) else {
        return;
    };

    outgoing.insert(header_name, header_value);
}

fn text_response(status: StatusCode, message: &str) -> Response<Body> {
    response_with_body(
        status,
        "text/plain; charset=utf-8",
        Body::from(message.to_string()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use ani_desk_core::providers::{allanime::AllAnimeProvider, AnimeProvider};

    #[test]
    fn limits_invalid_certificate_fallback_to_mp4upload_sessions() {
        let normal = StreamInfo {
            video_url: "https://cdn.example.com/video.mp4".into(),
            subtitles: Vec::new(),
            qualities: Vec::new(),
            headers: HashMap::new(),
        };
        assert!(!requires_insecure_tls(&normal));

        let mut mp4upload = normal.clone();
        mp4upload.video_url = "https://a4.mp4upload.com/video.mp4".into();
        assert!(requires_insecure_tls(&mp4upload));

        let mut redirected = normal;
        redirected
            .headers
            .insert("Referer".into(), "https://www.mp4upload.com/".into());
        assert!(requires_insecure_tls(&redirected));
    }

    #[tokio::test]
    #[ignore = "requires live AllAnime and mp4upload network access"]
    async fn live_allanime_episode_plays_through_local_proxy() -> Result<()> {
        let provider = AllAnimeProvider::new();
        let anime = provider
            .search("One Piece: Gyojin Tou-hen")
            .await?
            .into_iter()
            .find(|anime| anime.title == "One Piece: Gyojin Tou-hen")
            .context("AllAnime title was not found")?;
        let episode = provider
            .get_episodes(&anime.id)
            .await?
            .into_iter()
            .find(|episode| episode.number == 1)
            .context("AllAnime episode 1 was not found")?;
        let stream = provider.get_stream_url(&episode.id).await?;

        let proxy = ProxyState::start().await?;
        let session = proxy.create_session(&stream).await?;
        let mut response = Client::new().get(session.playback_url).send().await?;
        anyhow::ensure!(
            response.status().is_success(),
            "local playback proxy returned HTTP {}",
            response.status()
        );
        let content_type = response
            .headers()
            .get(reqwest_header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if content_type.contains("mpegurl") {
            let playlist = response.text().await?;
            anyhow::ensure!(
                playlist.starts_with("#EXTM3U"),
                "proxy returned invalid HLS"
            );
            let resource_url = playlist
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty() && !line.starts_with('#'))
                .context("proxy HLS playlist contained no resource")?;
            let mut resource = Client::new().get(resource_url).send().await?;
            anyhow::ensure!(
                resource.status().is_success(),
                "proxy HLS resource returned HTTP {}",
                resource.status()
            );
            let first_chunk = resource
                .chunk()
                .await?
                .context("proxy HLS resource returned an empty body")?;
            anyhow::ensure!(!first_chunk.is_empty(), "proxy HLS resource was empty");
        } else {
            anyhow::ensure!(
                content_type.starts_with("video/") || content_type == "application/octet-stream",
                "local playback proxy returned {content_type}"
            );
            let first_chunk = response
                .chunk()
                .await?
                .context("local playback proxy returned an empty body")?;
            anyhow::ensure!(
                !first_chunk.is_empty(),
                "local playback proxy returned no media"
            );
        }
        Ok(())
    }

    #[test]
    fn rewrites_playlist_segments_and_keys() {
        let playlist = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"keys/key.bin\"\n#EXTINF:4.0,\nsegment 1.ts\n#EXT-X-MAP:URI=\"init.mp4\"\nhttps://cdn.example.com/absolute.ts";
        let rewritten = rewrite_playlist(
            "http://127.0.0.1:1234",
            "session-id",
            "https://media.example.com/path/master.m3u8",
            playlist,
        );

        assert!(rewritten.contains("http://127.0.0.1:1234/resource/session-id?url=https%3A%2F%2Fmedia.example.com%2Fpath%2Fkeys%2Fkey.bin"));
        assert!(rewritten.contains("http://127.0.0.1:1234/resource/session-id?url=https%3A%2F%2Fmedia.example.com%2Fpath%2Fsegment%25201.ts"));
        assert!(rewritten.contains("http://127.0.0.1:1234/resource/session-id?url=https%3A%2F%2Fmedia.example.com%2Fpath%2Finit.mp4"));
        assert!(rewritten.contains("http://127.0.0.1:1234/resource/session-id?url=https%3A%2F%2Fcdn.example.com%2Fabsolute.ts"));
    }

    #[test]
    fn detects_hls_from_url_or_content_type() {
        assert!(is_hls_playlist("https://example.com/index.m3u8", ""));
        assert!(is_hls_playlist(
            "https://example.com/play",
            "application/vnd.apple.mpegurl"
        ));
        assert!(!is_hls_playlist(
            "https://example.com/video.mp4",
            "video/mp4"
        ));
    }

    #[test]
    fn rewrites_dash_base_urls_and_adds_a_default_base() {
        let manifest =
            r#"<?xml version="1.0"?><MPD><Period><BaseURL>video/</BaseURL></Period></MPD>"#;
        let rewritten = rewrite_dash_manifest(
            "http://127.0.0.1:1234",
            "session-id",
            "https://cdn.example.com/show/index.mpd",
            manifest,
        );
        assert!(rewritten.contains("http://127.0.0.1:1234/dash/session-id/base/"));
        assert!(!rewritten.contains(">video/</BaseURL>"));

        let without_base = rewrite_dash_manifest(
            "http://127.0.0.1:1234",
            "session-id",
            "https://cdn.example.com/show/index.mpd",
            "<MPD><Period /></MPD>",
        );
        assert!(without_base.contains("<MPD><BaseURL>http://127.0.0.1:1234/dash/session-id/base/"));
    }
}
