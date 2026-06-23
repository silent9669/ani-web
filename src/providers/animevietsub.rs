use super::{Anime, AnimeProvider, Episode, Language, StreamInfo};
use anyhow::{Context, Result};
use async_trait::async_trait;
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

const API: &str = "https://api.animapper.net/api/v1";
pub struct AnimeVietSubProvider {
    client: reqwest::Client,
    name: &'static str,
    provider_code: &'static str,
}

impl Default for AnimeVietSubProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl AnimeVietSubProvider {
    pub fn new() -> Self {
        Self::for_provider("AnimeVietSub", "ANIMEVIETSUB")
    }

    pub fn for_provider(name: &'static str, provider_code: &'static str) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static("ani-desk/1.0.2"));
        Self {
            client: reqwest::Client::builder()
                .default_headers(headers)
                .timeout(Duration::from_secs(15))
                .build()
                .expect("failed to build AniMapper client"),
            name,
            provider_code,
        }
    }

    async fn json(&self, request: reqwest::RequestBuilder, operation: &str) -> Result<Value> {
        let response = request
            .send()
            .await
            .with_context(|| format!("{operation} request failed"))?;
        let status = response.status();
        let body: Value = response
            .json()
            .await
            .with_context(|| format!("{operation} returned invalid JSON"))?;
        if !status.is_success() {
            let code = body["code"].as_str().unwrap_or("ANIMAPPER_ERROR");
            let message = body["message"]
                .as_str()
                .unwrap_or("AniMapper request failed");
            anyhow::bail!("{code}: {message}");
        }
        Ok(body)
    }
}

#[async_trait]
impl AnimeProvider for AnimeVietSubProvider {
    fn name(&self) -> &str {
        self.name
    }

    fn language(&self) -> Language {
        Language::Vietnamese
    }

    fn supported_languages(&self) -> Vec<String> {
        vec!["vi".into()]
    }

    async fn search(&self, query: &str) -> Result<Vec<Anime>> {
        let body = self
            .json(
                self.client.get(format!("{API}/search")).query(&[
                    ("title", query),
                    ("mediaType", "ANIME"),
                    ("limit", "20"),
                ]),
                &format!("{} search", self.name),
            )
            .await?;
        let mut results = body["results"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|item| {
                let id = item["id"].as_i64()?.to_string();
                let title = item["titles"]["vi"]
                    .as_str()
                    .or_else(|| item["titles"]["main"].as_str())
                    .or_else(|| item["titles"]["user-preferred"].as_str())
                    .or_else(|| item["titles"]["en"].as_str())?
                    .to_string();
                let cover = item["images"]["coverXl"]
                    .as_str()
                    .or_else(|| item["images"]["coverLg"].as_str())?
                    .to_string();
                let score = search_score(query, item);
                Some((
                    score,
                    Anime {
                        id,
                        provider: self.name.into(),
                        title,
                        cover_url: cover,
                        banner_url: item["images"]["bannerUrl"].as_str().map(str::to_string),
                        language: Language::Vietnamese,
                        total_episodes: None,
                        synopsis: None,
                    },
                ))
            })
            .collect::<Vec<_>>();
        results.sort_by_key(|item| std::cmp::Reverse(item.0));
        Ok(results.into_iter().map(|(_, anime)| anime).collect())
    }

    async fn get_episodes(&self, anime_id: &str) -> Result<Vec<Episode>> {
        let body = self
            .json(
                self.client.get(format!("{API}/stream/episodes")).query(&[
                    ("id", anime_id),
                    ("provider", self.provider_code),
                    ("limit", "0"),
                ]),
                &format!("{} episodes", self.name),
            )
            .await?;
        Ok(body["episodes"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|episode| {
                let raw_number = episode["episodeNumber"].as_str()?;
                let digits = raw_number.split('_').next()?.trim_start_matches('0');
                let number = if digits.is_empty() {
                    0
                } else {
                    digits.parse::<u32>().ok()?
                };
                if number == 0 {
                    return None;
                }
                Some(Episode {
                    id: episode["episodeId"].as_str()?.to_string(),
                    number,
                    title: Some(format!("Episode {raw_number}")),
                    thumbnail: None,
                })
            })
            .collect())
    }

    async fn get_stream_url(&self, episode_id: &str) -> Result<StreamInfo> {
        let body = self
            .json(
                self.client.get(format!("{API}/stream/source")).query(&[
                    ("episodeData", episode_id),
                    ("provider", self.provider_code),
                ]),
                &format!("{} stream", self.name),
            )
            .await?;
        if body["type"].as_str() != Some("HLS") {
            anyhow::bail!(
                "STREAM_UNSUPPORTED: {} returned a non-HLS stream",
                self.name
            );
        }
        let raw_video_url = body["url"]
            .as_str()
            .with_context(|| format!("STREAM_NOT_FOUND: {} returned no stream URL", self.name))?;
        let video_url = reqwest::Url::parse(raw_video_url)
            .or_else(|_| reqwest::Url::parse(&format!("{API}/"))?.join(raw_video_url))
            .with_context(|| {
                format!(
                    "STREAM_NOT_FOUND: {} returned an invalid stream URL",
                    self.name
                )
            })?
            .to_string();
        let mut headers = HashMap::new();
        if let Some(values) = body["proxyHeaders"].as_object() {
            for (key, value) in values {
                if let Some(value) = value.as_str() {
                    headers.insert(key.clone(), value.to_string());
                }
            }
        }
        Ok(StreamInfo {
            video_url,
            subtitles: Vec::new(),
            qualities: vec!["auto".into()],
            headers,
        })
    }

    async fn health_check(&self) -> Result<()> {
        let episodes = self.get_episodes("21").await?;
        let episode = episodes
            .last()
            .with_context(|| format!("{} health check found no One Piece episodes", self.name))?;
        self.get_stream_url(&episode.id).await?;
        Ok(())
    }
}

fn normalized(value: &str) -> String {
    value
        .chars()
        .filter_map(|character| {
            if character.is_ascii_alphanumeric() {
                Some(character.to_ascii_lowercase())
            } else if character.is_whitespace() {
                Some(' ')
            } else {
                None
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn title_values(item: &Value) -> Vec<String> {
    item["titles"]
        .as_object()
        .map(|titles| {
            titles
                .values()
                .filter_map(|value| value.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn search_score(query: &str, item: &Value) -> i32 {
    let query = normalized(query);
    let titles = title_values(item);
    let mut score = titles
        .iter()
        .map(|title| {
            let title = normalized(title);
            if title == query {
                1000
            } else if title.starts_with(&query) {
                650
            } else if title.contains(&query) {
                350
            } else {
                0
            }
        })
        .max()
        .unwrap_or_default();

    match item["format"].as_str().unwrap_or_default() {
        "TV" => score += 300,
        "MOVIE" if query.contains("movie") || query.contains("film") => score += 250,
        "MOVIE" => score -= 40,
        "SPECIAL" | "OVA" | "ONA" => score -= 120,
        _ => {}
    }

    if item["status"].as_str() == Some("RELEASING") {
        score += 80;
    }

    score
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_identity_is_stable() {
        let provider = AnimeVietSubProvider::new();
        assert_eq!(provider.name(), "AnimeVietSub");
        assert_eq!(provider.language(), Language::Vietnamese);
    }

    #[test]
    fn ranks_exact_tv_result_above_specials() {
        let special = serde_json::json!({
            "format": "SPECIAL",
            "status": "FINISHED",
            "titles": {"en": "One Piece: Episode of Skypiea"}
        });
        let series = serde_json::json!({
            "format": "TV",
            "status": "RELEASING",
            "titles": {"main": "One Piece", "vi": "Đảo hải tặc"}
        });
        assert!(search_score("One Piece", &series) > search_score("One Piece", &special));
    }
}
