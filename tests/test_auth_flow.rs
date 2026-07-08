use base64::{engine::general_purpose::STANDARD, Engine as _};
use md5::{Digest, Md5};
use reqwest::Client;
use std::time::{SystemTime, UNIX_EPOCH};

#[tokio::test]
async fn test_auth_flow() {
    let client = Client::new();
    let url_tab =
        "https://api6.aoneroom.com/wefeed-mobile-bff/tab-operating?page=1&tabId=0&version=";

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let content_type = "application/json";

    let url_parsed = reqwest::Url::parse(url_tab).unwrap();
    let query = url_parsed.query().unwrap_or("");
    let canonical = format!(
        "GET\napplication/json\n{content_type}\n\n{timestamp}\n\n{}?{}",
        url_parsed.path(),
        query
    );

    let secret = "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
    let first = STANDARD.decode(secret).unwrap();
    let encoded_key = String::from_utf8(first).unwrap();
    let key = STANDARD.decode(encoded_key.trim()).unwrap();

    let mut mac = hmac::Hmac::<Md5>::new_from_slice(&key).unwrap();
    use hmac::Mac;
    mac.update(canonical.as_bytes());
    let signature = STANDARD.encode(mac.finalize().into_bytes());

    let reversed_timestamp = timestamp.to_string().chars().rev().collect::<String>();
    let digest = Md5::digest(reversed_timestamp.as_bytes());
    let token_hash = digest
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();

    let client_info = serde_json::json!({
        "package_name": "com.community.oneroom",
        "version_name": "3.0.05.0711.03",
        "version_code": 50020052,
        "os": "android",
        "os_version": "16",
        "device_id": "da2b99c821e6ea023e4be55b54d5f7d8",
        "install_store": "ps",
        "gaid": "d7578036d13336cc",
        "brand": "google",
        "model": "sdk_gphone64_x86_64",
        "system_language": "en",
        "net": "NETWORK_WIFI",
        "region": "IN",
        "timezone": "Asia/Calcutta",
        "sp_code": ""
    })
    .to_string();

    let res = client.get(url_tab)
        .header("User-Agent", "com.community.oneroom/50020052 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)")
        .header("Accept", "application/json")
        .header("Content-Type", content_type)
        .header("X-Client-Token", format!("{},{}", timestamp, token_hash))
        .header("x-tr-signature", format!("{}|2|{}", timestamp, signature))
        .header("X-Client-Info", client_info.clone())
        .header("X-Client-Status", "0")
        .header("x-play-mode", "2")
        .send()
        .await
        .unwrap();

    println!("Tab Status: {}", res.status());
    let x_user = res.headers().get("x-user").unwrap().to_str().unwrap();
    println!("X-User: {}", x_user);

    let x_user_json: serde_json::Value = serde_json::from_str(x_user).unwrap();
    let auth_token = x_user_json["token"].as_str().unwrap();

    // Now make the request to get subject details
    let url_subject = "https://api6.aoneroom.com/wefeed-mobile-bff/subject-api/get?subjectId=35142";

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let url_parsed = reqwest::Url::parse(url_subject).unwrap();
    let query = url_parsed.query().unwrap_or("");
    let canonical = format!(
        "GET\napplication/json\n{content_type}\n\n{timestamp}\n\n{}?{}",
        url_parsed.path(),
        query
    );

    let mut mac = hmac::Hmac::<Md5>::new_from_slice(&key).unwrap();
    mac.update(canonical.as_bytes());
    let signature = STANDARD.encode(mac.finalize().into_bytes());

    let reversed_timestamp = timestamp.to_string().chars().rev().collect::<String>();
    let digest = Md5::digest(reversed_timestamp.as_bytes());
    let token_hash = digest
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();

    let res = client.get(url_subject)
        .header("User-Agent", "com.community.oneroom/50020052 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)")
        .header("Accept", "application/json")
        .header("Content-Type", content_type)
        .header("X-Client-Token", format!("{},{}", timestamp, token_hash))
        .header("x-tr-signature", format!("{}|2|{}", timestamp, signature))
        .header("X-Client-Info", client_info)
        .header("X-Client-Status", "0")
        .header("x-play-mode", "2")
        .header("Authorization", format!("Bearer {}", auth_token))
        .send()
        .await
        .unwrap();

    println!("Subject Status: {}", res.status());
    let text = res.text().await.unwrap();
    println!(
        "Subject Response: {}",
        &text[..std::cmp::min(1000, text.len())]
    );
}
