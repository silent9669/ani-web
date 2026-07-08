#[tokio::test]
async fn test_avs_eps() {
    let provider = ani_desk_core::providers::animevietsub::AnimeVietSubProvider::new();
    let res = ani_desk_core::providers::AnimeProvider::search(&provider, "naruto")
        .await
        .unwrap();
    let anime = res.into_iter().next().unwrap();
    let eps = ani_desk_core::providers::AnimeProvider::get_episodes(&provider, &anime.id)
        .await
        .unwrap();
    let ep = eps.into_iter().next().unwrap();
    println!("Testing stream for ep: {}", ep.id);
    let stream = ani_desk_core::providers::AnimeProvider::get_stream_url(&provider, &ep.id).await;
    println!("Stream: {:?}", stream);
}
