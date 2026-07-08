#[tokio::test]
async fn test_avs_search() {
    let provider = ani_desk_core::providers::animevietsub::AnimeVietSubProvider::new();
    let res = ani_desk_core::providers::AnimeProvider::search(&provider, "one piece")
        .await
        .unwrap();
    println!("Search results: {:?}", res);
}
