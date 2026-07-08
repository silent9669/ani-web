use ani_desk_core::providers::AnimeProvider;

#[tokio::test]
async fn test_mb_get() {
    let provider = ani_desk_core::providers::moviebox::MovieBoxProvider::new();
    // Test a GET request to see if it works. "35142" is a dummy ID.
    let res = provider.get_anime_details("35142").await;
    println!("Details result: {:?}", res);
}
