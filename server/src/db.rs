use anyhow::{Context, Result};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Duration, Utc};
use rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{path::Path, sync::Arc};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Clone)]
pub struct WebDatabase {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUser {
    pub id: String,
    pub username: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedUser {
    pub id: String,
    pub username: String,
    pub role: String,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteRecord {
    pub anime_id: String,
    pub catalog_id: Option<i64>,
    pub provider: String,
    pub title: String,
    pub cover_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub anime_id: String,
    pub catalog_id: Option<i64>,
    pub provider: String,
    pub title: String,
    pub cover_url: String,
    pub episode_number: u32,
    pub episode_title: Option<String>,
    pub position_seconds: u64,
    pub total_seconds: u64,
    pub updated_at: String,
}

pub struct NewFavorite<'a> {
    pub anime_id: &'a str,
    pub catalog_id: Option<i64>,
    pub provider: &'a str,
    pub title: &'a str,
    pub cover_url: &'a str,
}

pub struct NewHistory<'a> {
    pub anime_id: &'a str,
    pub catalog_id: Option<i64>,
    pub provider: &'a str,
    pub title: &'a str,
    pub cover_url: &'a str,
    pub episode_number: u32,
    pub episode_title: Option<&'a str>,
    pub position_seconds: u64,
    pub total_seconds: u64,
}

impl WebDatabase {
    pub async fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let conn = Connection::open(path)
            .with_context(|| format!("failed to open web database at {}", path.display()))?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate().await?;
        Ok(db)
    }

    async fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().await;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE TABLE IF NOT EXISTS user_favorites (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                anime_id TEXT NOT NULL,
                catalog_id INTEGER,
                provider TEXT NOT NULL,
                title TEXT NOT NULL,
                cover_url TEXT NOT NULL,
                added_at TEXT NOT NULL,
                PRIMARY KEY(user_id, anime_id)
            );
            CREATE TABLE IF NOT EXISTS user_history (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                anime_id TEXT NOT NULL,
                catalog_id INTEGER,
                provider TEXT NOT NULL,
                title TEXT NOT NULL,
                cover_url TEXT NOT NULL,
                episode_number INTEGER NOT NULL,
                episode_title TEXT,
                position_seconds INTEGER NOT NULL,
                total_seconds INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(user_id, anime_id)
            );
            CREATE INDEX IF NOT EXISTS idx_user_history_updated
                ON user_history(user_id, updated_at DESC);",
        )?;
        Ok(())
    }

    pub async fn bootstrap_admin(&self, username: &str, password: &str) -> Result<()> {
        validate_username(username)?;
        validate_password(password)?;
        let exists: bool = {
            let conn = self.conn.lock().await;
            conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM users WHERE username = ?1 COLLATE NOCASE)",
                [username],
                |row| row.get(0),
            )?
        };
        if exists {
            return Ok(());
        }
        let hash = hash_password_async(password).await?;
        self.conn.lock().await.execute(
            "INSERT OR IGNORE INTO users (id, username, password_hash, role, enabled, created_at)
             VALUES (?1, ?2, ?3, 'admin', 1, ?4)",
            params![
                Uuid::new_v4().to_string(),
                username,
                hash,
                Utc::now().to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub async fn authenticate(
        &self,
        username: &str,
        password: &str,
    ) -> Result<Option<SessionUser>> {
        let row = {
            let conn = self.conn.lock().await;
            conn.query_row(
                "SELECT id, username, role, password_hash, enabled
                 FROM users WHERE username = ?1 COLLATE NOCASE",
                [username.trim()],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, bool>(4)?,
                    ))
                },
            )
            .optional()?
        };
        let Some((id, username, role, hash, enabled)) = row else {
            // Perform comparable KDF work so unknown usernames are not a cheap oracle.
            let _ = hash_password_async(password).await;
            return Ok(None);
        };
        if !enabled || !verify_password_async(password, &hash).await? {
            return Ok(None);
        }
        Ok(Some(SessionUser { id, username, role }))
    }

    pub async fn create_session(&self, user_id: &str) -> Result<String> {
        let mut raw = [0_u8; 32];
        OsRng.fill_bytes(&mut raw);
        let token = URL_SAFE_NO_PAD.encode(raw);
        let now = Utc::now();
        let conn = self.conn.lock().await;
        conn.execute(
            "DELETE FROM sessions WHERE expires_at <= ?1",
            [now.to_rfc3339()],
        )?;
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                token_hash(&token),
                user_id,
                (now + Duration::days(30)).to_rfc3339(),
                now.to_rfc3339()
            ],
        )?;
        Ok(token)
    }

    pub async fn session_user(&self, token: &str) -> Result<Option<SessionUser>> {
        let conn = self.conn.lock().await;
        let now = Utc::now().to_rfc3339();
        let user = conn
            .query_row(
                "SELECT u.id, u.username, u.role
                 FROM sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND u.enabled = 1",
                params![token_hash(token), now],
                |row| {
                    Ok(SessionUser {
                        id: row.get(0)?,
                        username: row.get(1)?,
                        role: row.get(2)?,
                    })
                },
            )
            .optional()?;
        Ok(user)
    }

    pub async fn revoke_session(&self, token: &str) -> Result<()> {
        self.conn.lock().await.execute(
            "DELETE FROM sessions WHERE token_hash = ?1",
            [token_hash(token)],
        )?;
        Ok(())
    }

    pub async fn list_users(&self) -> Result<Vec<ManagedUser>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare("SELECT id, username, role, enabled, created_at FROM users ORDER BY username COLLATE NOCASE")?;
        let users = stmt
            .query_map([], |row| {
                Ok(ManagedUser {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    role: row.get(2)?,
                    enabled: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(users)
    }

    pub async fn create_user(
        &self,
        username: &str,
        password: &str,
        role: &str,
    ) -> Result<ManagedUser> {
        validate_username(username)?;
        validate_password(password)?;
        anyhow::ensure!(
            matches!(role, "admin" | "user"),
            "role must be admin or user"
        );
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        let password_hash = hash_password_async(password).await?;
        let conn = self.conn.lock().await;
        conn.execute(
            "INSERT INTO users (id, username, password_hash, role, enabled, created_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5)",
            params![id, username.trim(), password_hash, role, created_at],
        )?;
        Ok(ManagedUser {
            id,
            username: username.trim().into(),
            role: role.into(),
            enabled: true,
            created_at,
        })
    }

    pub async fn update_user(
        &self,
        id: &str,
        enabled: bool,
        role: &str,
        password: Option<&str>,
    ) -> Result<()> {
        anyhow::ensure!(
            matches!(role, "admin" | "user"),
            "role must be admin or user"
        );
        let password_hash = if let Some(password) = password.filter(|value| !value.is_empty()) {
            validate_password(password)?;
            Some(hash_password_async(password).await?)
        } else {
            None
        };
        let conn = self.conn.lock().await;
        if let Some(password_hash) = password_hash {
            conn.execute(
                "UPDATE users SET enabled = ?1, role = ?2, password_hash = ?3 WHERE id = ?4",
                params![enabled, role, password_hash, id],
            )?;
        } else {
            conn.execute(
                "UPDATE users SET enabled = ?1, role = ?2 WHERE id = ?3",
                params![enabled, role, id],
            )?;
        }
        if !enabled {
            conn.execute("DELETE FROM sessions WHERE user_id = ?1", [id])?;
        }
        Ok(())
    }

    pub async fn favorites(&self, user_id: &str, limit: usize) -> Result<Vec<FavoriteRecord>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT anime_id, catalog_id, provider, title, cover_url FROM user_favorites
             WHERE user_id = ?1 ORDER BY added_at DESC LIMIT ?2",
        )?;
        let favorites = stmt
            .query_map(params![user_id, limit], |row| {
                Ok(FavoriteRecord {
                    anime_id: row.get(0)?,
                    catalog_id: row.get(1)?,
                    provider: row.get(2)?,
                    title: row.get(3)?,
                    cover_url: row.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(favorites)
    }

    pub async fn save_favorite(&self, user_id: &str, value: &NewFavorite<'_>) -> Result<()> {
        self.conn.lock().await.execute(
            "INSERT OR REPLACE INTO user_favorites
             (user_id, anime_id, catalog_id, provider, title, cover_url, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                user_id,
                value.anime_id,
                value.catalog_id,
                value.provider,
                value.title,
                value.cover_url,
                Utc::now().to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub async fn remove_favorite(&self, user_id: &str, anime_id: &str) -> Result<()> {
        self.conn.lock().await.execute(
            "DELETE FROM user_favorites WHERE user_id = ?1 AND anime_id = ?2",
            params![user_id, anime_id],
        )?;
        Ok(())
    }

    pub async fn history(&self, user_id: &str, limit: usize) -> Result<Vec<HistoryRecord>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT anime_id, catalog_id, provider, title, cover_url, episode_number,
                    episode_title, position_seconds, total_seconds, updated_at
             FROM user_history WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT ?2",
        )?;
        let history = stmt
            .query_map(params![user_id, limit], |row| {
                Ok(HistoryRecord {
                    anime_id: row.get(0)?,
                    catalog_id: row.get(1)?,
                    provider: row.get(2)?,
                    title: row.get(3)?,
                    cover_url: row.get(4)?,
                    episode_number: row.get(5)?,
                    episode_title: row.get(6)?,
                    position_seconds: row.get(7)?,
                    total_seconds: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(history)
    }

    pub async fn save_history(&self, user_id: &str, value: &NewHistory<'_>) -> Result<()> {
        self.conn.lock().await.execute(
            "INSERT OR REPLACE INTO user_history
             (user_id, anime_id, catalog_id, provider, title, cover_url, episode_number,
              episode_title, position_seconds, total_seconds, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                user_id,
                value.anime_id,
                value.catalog_id,
                value.provider,
                value.title,
                value.cover_url,
                value.episode_number,
                value.episode_title,
                value.position_seconds,
                value.total_seconds,
                Utc::now().to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub async fn remove_history(&self, user_id: &str, anime_id: &str) -> Result<()> {
        self.conn.lock().await.execute(
            "DELETE FROM user_history WHERE user_id = ?1 AND anime_id = ?2",
            params![user_id, anime_id],
        )?;
        Ok(())
    }
}

fn hash_password(password: &str) -> Result<String> {
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
        .map_err(|error| anyhow::anyhow!(error.to_string()))?
        .to_string())
}

async fn hash_password_async(password: &str) -> Result<String> {
    let password = password.to_owned();
    tokio::task::spawn_blocking(move || hash_password(&password))
        .await
        .context("password hashing task stopped")?
}

fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash).ok().is_some_and(|parsed| {
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
}

async fn verify_password_async(password: &str, hash: &str) -> Result<bool> {
    let password = password.to_owned();
    let hash = hash.to_owned();
    tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .context("password verification task stopped")
}

fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

fn validate_username(username: &str) -> Result<()> {
    let value = username.trim();
    anyhow::ensure!(
        (3..=40).contains(&value.len()),
        "username must contain 3 to 40 characters"
    );
    anyhow::ensure!(
        value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')),
        "username contains unsupported characters"
    );
    Ok(())
}

fn validate_password(password: &str) -> Result<()> {
    anyhow::ensure!(
        (10..=256).contains(&password.len()),
        "password must contain at least 10 characters"
    );
    Ok(())
}
