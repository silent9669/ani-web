use super::{Anime, AnimeProvider, Episode, Language, ProviderCapabilities, StreamInfo};
use anyhow::Result;
use async_trait::async_trait;

pub struct HiAnimeProvider;

impl Default for HiAnimeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl HiAnimeProvider {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AnimeProvider for HiAnimeProvider {
    fn name(&self) -> &str {
        "HiAnime"
    }

    fn language(&self) -> Language {
        Language::English
    }

    fn supported_languages(&self) -> Vec<String> {
        vec!["en".into()]
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            search: false,
            details: false,
            episodes: false,
            playback: false,
            subtitles: false,
        }
    }

    async fn search(&self, _query: &str) -> Result<Vec<Anime>> {
        anyhow::bail!("PROVIDER_NOT_CERTIFIED: HiAnime direct playback is not certified")
    }

    async fn get_episodes(&self, _anime_id: &str) -> Result<Vec<Episode>> {
        anyhow::bail!("PROVIDER_NOT_CERTIFIED: HiAnime direct playback is not certified")
    }

    async fn get_stream_url(&self, _episode_id: &str) -> Result<StreamInfo> {
        anyhow::bail!("PROVIDER_NOT_CERTIFIED: HiAnime direct playback is not certified")
    }

    async fn health_check(&self) -> Result<()> {
        anyhow::bail!("PROVIDER_NOT_CERTIFIED: HiAnime direct playback is not certified")
    }
}
