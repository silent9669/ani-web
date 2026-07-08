#[tokio::test]
async fn test_aa_post() {
    let client = reqwest::Client::new();
    let variables = serde_json::json!({
        "showId": "bNxsZLcHxRPbs4eTf",
        "translationType": "sub",
        "episodeString": "1"
    });
    let query = "query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}";

    let res = client
        .post("https://api.allanime.day/api")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        )
        .header("Referer", "https://allanime.to/")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "variables": variables,
            "query": query
        }))
        .send()
        .await
        .unwrap();
    println!("Status: {}", res.status());
    println!("Body: {}", res.text().await.unwrap());
}
