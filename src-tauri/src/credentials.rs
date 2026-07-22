//! Secrets (host passwords, key passphrases, AI API keys) live in app-data
//! `secrets.json` instead of the OS keychain — avoids keychain access prompts.

use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn data_dir() -> AppResult<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| AppError::Message("无法定位数据目录".into()))?;
    let dir = base.join("PeekShell");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn store_path() -> AppResult<PathBuf> {
    Ok(data_dir()?.join("secrets.json"))
}

fn secret_key(id: &str, kind: &str) -> String {
    format!("{id}/{kind}")
}

fn load() -> AppResult<HashMap<String, String>> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

fn save(map: &HashMap<String, String>) -> AppResult<()> {
    let path = store_path()?;
    let raw = serde_json::to_string_pretty(map)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn set_secret(id: &str, kind: &str, value: &str) -> AppResult<()> {
    let mut map = load()?;
    map.insert(secret_key(id, kind), value.to_string());
    save(&map)
}

pub fn get_secret(id: &str, kind: &str) -> AppResult<Option<String>> {
    Ok(load()?.get(&secret_key(id, kind)).cloned())
}

pub fn delete_secret(id: &str, kind: &str) -> AppResult<()> {
    let mut map = load()?;
    map.remove(&secret_key(id, kind));
    save(&map)
}

pub fn delete_all_secrets(id: &str) -> AppResult<()> {
    delete_secret(id, "password")?;
    delete_secret(id, "passphrase")?;
    Ok(())
}
