#[tokio::test]
async fn test_avs_debug() {
    let client = reqwest::Client::new();
    let res = client.get("https://api.animapper.net/api/v1/stream/source?episodeData=a1$35&provider=animevietsub")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .header("Referer", "https://animevietsub.io/")
        .send().await.unwrap();
    println!("Status: {}", res.status());
    println!("Body: {}", res.text().await.unwrap());
}
