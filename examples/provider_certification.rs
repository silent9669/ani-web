use ani_desk_core::config::Config;
use ani_desk_core::providers::{AnimeProvider, Language, ProviderRegistry};
use anyhow::{Context, Result};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, RANGE};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<()> {
    let require_english = std::env::args().any(|argument| argument == "--require-english");
    let registry = ProviderRegistry::new(&Config::default());
    let mut healthy_english = 0usize;
    let mut failures = Vec::new();

    for provider in registry.list_providers() {
        if !provider.capabilities().playback {
            println!("SKIP {}: playback is not certified", provider.name());
            continue;
        }
        match certify(provider.as_ref()).await {
            Ok(()) => {
                println!("PASS {} ({})", provider.name(), provider.language());
                if provider.language() == Language::English {
                    healthy_english += 1;
                }
            }
            Err(error) => {
                println!("FAIL {}: {error:#}", provider.name());
                failures.push(provider.name().to_string());
            }
        }
    }

    if require_english && healthy_english == 0 {
        anyhow::bail!(
            "release blocked: no English provider passed live playback certification; failures: {}",
            failures.join(", ")
        );
    }
    if !failures.is_empty() {
        anyhow::bail!(
            "release blocked: enabled providers failed live playback certification: {}",
            failures.join(", ")
        );
    }
    Ok(())
}

async fn certify(provider: &dyn AnimeProvider) -> Result<()> {
    let queries = match (provider.language(), provider.name()) {
        (Language::English, "MovieBox") => &["One Piece", "Your Name"][..],
        (Language::Vietnamese, "Niniyo") => &["Solo Leveling", "Attack on Titan"][..],
        (Language::English, _) | (Language::Vietnamese, _) => &["One Piece"][..],
    };
    for query in queries {
        certify_query(provider, query)
            .await
            .with_context(|| format!("{query} certification failed"))?;
    }
    Ok(())
}

async fn certify_query(provider: &dyn AnimeProvider, query: &str) -> Result<()> {
    let mut last_error = None;
    let mut results = Vec::new();
    for candidate_query in query_aliases(query) {
        let mut found = provider
            .search(candidate_query)
            .await
            .with_context(|| format!("search failed for {candidate_query}"))?;
        results.append(&mut found);
    }
    dedupe_results(&mut results);
    let aliases = query_aliases(query)
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    results.sort_by_key(|anime| {
        (
            std::cmp::Reverse(best_title_score(&anime.title, &aliases)),
            std::cmp::Reverse(anime.total_episodes.unwrap_or_default()),
        )
    });
    for anime in results.into_iter().take(10) {
        if best_title_score(&anime.title, &aliases) < 300 {
            continue;
        }
        match certify_anime(provider, &anime).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(format!("{} [{}]: {error:#}", anime.title, anime.id));
            }
        }
    }
    anyhow::bail!(
        "no searchable result produced a playable stream{}",
        last_error
            .map(|error| format!("; last error: {error}"))
            .unwrap_or_default()
    )
}

fn query_aliases(query: &str) -> Vec<&str> {
    match query {
        "One Piece" => vec!["One Piece", "Đảo Hải Tặc"],
        "Attack on Titan" => vec!["Attack on Titan", "Đại Chiến Titan"],
        "Your Name" => vec!["Your Name", "Kimi no Na wa"],
        "Kimi no Na wa" => vec!["Kimi no Na wa", "Your Name"],
        _ => vec![query],
    }
}

fn dedupe_results(results: &mut Vec<ani_desk_core::providers::Anime>) {
    let mut seen = std::collections::HashSet::new();
    results.retain(|anime| seen.insert(format!("{}:{}", anime.provider, anime.id)));
}

fn best_title_score(title: &str, variants: &[String]) -> i32 {
    variants
        .iter()
        .map(|variant| title_match_score(title, variant))
        .max()
        .unwrap_or(0)
}

fn title_match_score(title: &str, target: &str) -> i32 {
    let title_compact = normalize_title(title);
    let target_compact = normalize_title(target);
    if title_compact.is_empty() || target_compact.is_empty() {
        return 0;
    }
    if title_compact == target_compact {
        return 1000;
    }
    if title_compact.starts_with(&target_compact) || target_compact.starts_with(&title_compact) {
        return 760;
    }
    if title_compact.contains(&target_compact) || target_compact.contains(&title_compact) {
        return 620;
    }

    let words_for_title = title_words(title);
    let target_words = title_words(target);
    if words_for_title.is_empty() || target_words.is_empty() {
        return 0;
    }
    let overlap = target_words
        .iter()
        .filter(|word| words_for_title.contains(word))
        .count();
    let required = target_words.len().min(words_for_title.len());
    if required > 0 && overlap == required {
        return 420;
    }
    if overlap >= 2 {
        return 300 + (overlap as i32 * 20);
    }
    0
}

fn normalize_title(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn title_words(value: &str) -> Vec<String> {
    value
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(|token| token.to_lowercase())
        .collect()
}

async fn certify_anime(
    provider: &dyn AnimeProvider,
    anime: &ani_desk_core::providers::Anime,
) -> Result<()> {
    let episodes = provider
        .get_episodes(&anime.id)
        .await
        .context("episode listing failed")?;
    anyhow::ensure!(!episodes.is_empty(), "episode listing returned no episodes");

    let mut last_error = None;
    for episode in episodes.into_iter().rev().take(24) {
        let stream = match provider.get_stream_url(&episode.id).await {
            Ok(stream) => stream,
            Err(error) => {
                last_error = Some(error.context("stream resolution failed"));
                continue;
            }
        };
        let stream_host = reqwest::Url::parse(&stream.video_url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_string))
            .unwrap_or_else(|| "unknown-host".to_string());
        println!(
            "  {} stream: {} [{}] episode {} -> {}",
            provider.name(),
            anime.title,
            anime.id,
            episode.number,
            stream_host
        );

        let mut headers = HeaderMap::new();
        for (name, value) in stream.headers {
            headers.insert(
                HeaderName::from_bytes(name.as_bytes()).context("invalid stream header name")?,
                HeaderValue::from_str(&value).context("invalid stream header value")?,
            );
        }
        headers.insert(RANGE, HeaderValue::from_static("bytes=0-4095"));
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .default_headers(headers)
            .build()?;
        let response = client.get(&stream.video_url).send().await?;
        let status = response.status();
        if !status.is_success() && status.as_u16() != 206 {
            last_error = Some(anyhow::anyhow!(
                "playlist/media retrieval returned HTTP {status}"
            ));
            continue;
        }
        if stream.video_url.to_ascii_lowercase().contains(".m3u8") {
            let body = response.text().await?;
            if !body.trim_start().starts_with("#EXTM3U") {
                last_error = Some(anyhow::anyhow!(
                    "resolved HLS URL did not return an HLS playlist"
                ));
                continue;
            }
        }
        return Ok(());
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("no recent episode produced a stream")))
}
