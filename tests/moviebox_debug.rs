#[tokio::test]
async fn test_moviebox() {
    let provider = ani_desk_core::providers::moviebox::MovieBoxProvider::new();
    let res = ani_desk_core::providers::AnimeProvider::search(&provider, "one piece")
        .await
        .unwrap();
    let anime = res.into_iter().next().unwrap();
    let eps = ani_desk_core::providers::AnimeProvider::get_episodes(&provider, &anime.id)
        .await
        .unwrap();
    let ep = eps.into_iter().next().unwrap();
    println!("Episode ID: {}", ep.id);
    let stream = ani_desk_core::providers::AnimeProvider::get_stream_url(&provider, &ep.id).await;
    println!("Stream: {:?}", stream);
}
