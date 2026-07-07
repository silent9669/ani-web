use ani_desk_core::providers::{animevietsub::AnimeVietSubProvider, AnimeProvider};
use anyhow::Result;

#[tokio::test]
#[ignore = "requires live network access to AnimeVietSub API"]
async fn test_animevietsub_live_stream_op() -> Result<()> {
    let av = AnimeVietSubProvider::new();
    let eps = av.get_episodes("21").await?;
    let last_ep = eps.last().unwrap();
    println!("Found episode: {:?}", last_ep);
    let stream = av.get_stream_url(&last_ep.id).await?;
    println!("Found stream: {:?}", stream);
    Ok(())
}
