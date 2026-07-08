use ani_desk_core::providers::moviebox::MovieBoxProvider;
use ani_desk_core::providers::AnimeProvider;
use anyhow::Result;

#[tokio::test]
async fn test_moviebox_search_and_get() -> Result<()> {
    let provider = MovieBoxProvider::new();

    println!("Searching for Naruto...");
    let search_results = provider.search("Naruto").await?;
    println!("Found {} results.", search_results.len());

    if let Some(first) = search_results.first() {
        println!("First result: {:?}", first);

        println!("Getting details for ID: {}", first.id);
        let details = provider.get_anime_details(&first.id).await;
        println!("Details: {:?}", details);

        println!("Getting episodes for ID: {}", first.id);
        let eps = provider.get_episodes(&first.id).await;
        println!("Episodes: {:?}", eps);
    }

    Ok(())
}
