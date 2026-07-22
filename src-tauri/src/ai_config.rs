//! AI provider configuration. API keys live in the OS keychain, never in JSON.

use crate::credentials;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

const API_KEY_KIND: &str = "api-key";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AiProviderKind {
    OpenAiCompatible,
    Anthropic,
    Ollama,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredProvider {
    id: String,
    name: String,
    kind: AiProviderKind,
    base_url: String,
    model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderRecord {
    pub id: String,
    pub name: String,
    pub kind: AiProviderKind,
    pub base_url: String,
    pub model: String,
    pub has_api_key: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderUpsert {
    pub id: Option<String>,
    pub name: String,
    pub kind: AiProviderKind,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_api_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub providers: Vec<AiProviderRecord>,
    pub active_provider_id: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiConfigFile {
    #[serde(default)]
    providers: Vec<StoredProvider>,
    active_provider_id: Option<String>,
}

fn store_path() -> AppResult<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| AppError::Message("无法定位数据目录".into()))?;
    let dir = base.join("PeekShell");
    fs::create_dir_all(&dir)?;
    Ok(dir.join("ai-config.json"))
}

fn load_file() -> AppResult<AiConfigFile> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(AiConfigFile::default());
    }
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn save_file(file: &AiConfigFile) -> AppResult<()> {
    fs::write(store_path()?, serde_json::to_string_pretty(file)?)?;
    Ok(())
}

fn secret_id(provider_id: &str) -> String {
    format!("ai-provider/{provider_id}")
}

fn to_record(provider: StoredProvider) -> AppResult<AiProviderRecord> {
    let has_api_key = credentials::get_secret(&secret_id(&provider.id), API_KEY_KIND)?.is_some();
    Ok(AiProviderRecord {
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        base_url: provider.base_url,
        model: provider.model,
        has_api_key,
    })
}

pub fn get_settings() -> AppResult<AiSettings> {
    let file = load_file()?;
    let providers = file
        .providers
        .into_iter()
        .map(to_record)
        .collect::<AppResult<Vec<_>>>()?;
    Ok(AiSettings {
        providers,
        active_provider_id: file.active_provider_id,
    })
}

pub fn upsert_provider(payload: AiProviderUpsert) -> AppResult<AiProviderRecord> {
    let name = payload.name.trim();
    let base_url = payload.base_url.trim().trim_end_matches('/');
    let model = payload.model.trim();
    if name.is_empty() || base_url.is_empty() || model.is_empty() {
        return Err(AppError::Message("名称、Base URL 和模型不能为空".into()));
    }
    if !(base_url.starts_with("http://") || base_url.starts_with("https://")) {
        return Err(AppError::Message(
            "Base URL 必须以 http:// 或 https:// 开头".into(),
        ));
    }

    let mut file = load_file()?;
    let id = payload
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    if payload.id.is_some() && !file.providers.iter().any(|provider| provider.id == id) {
        return Err(AppError::Message(format!("AI 提供商不存在: {id}")));
    }

    if payload.clear_api_key {
        credentials::delete_secret(&secret_id(&id), API_KEY_KIND)?;
    } else if let Some(api_key) = payload.api_key.as_deref().filter(|key| !key.is_empty()) {
        credentials::set_secret(&secret_id(&id), API_KEY_KIND, api_key)?;
    }

    let provider = StoredProvider {
        id: id.clone(),
        name: name.to_string(),
        kind: payload.kind,
        base_url: base_url.to_string(),
        model: model.to_string(),
    };
    if let Some(existing) = file.providers.iter_mut().find(|item| item.id == id) {
        *existing = provider.clone();
    } else {
        file.providers.push(provider.clone());
    }
    if file.active_provider_id.is_none() {
        file.active_provider_id = Some(id);
    }
    save_file(&file)?;
    to_record(provider)
}

pub fn delete_provider(id: &str) -> AppResult<()> {
    let mut file = load_file()?;
    let before = file.providers.len();
    file.providers.retain(|provider| provider.id != id);
    if file.providers.len() == before {
        return Err(AppError::Message(format!("AI 提供商不存在: {id}")));
    }
    credentials::delete_secret(&secret_id(id), API_KEY_KIND)?;
    if file.active_provider_id.as_deref() == Some(id) {
        file.active_provider_id = file.providers.first().map(|provider| provider.id.clone());
    }
    save_file(&file)
}

pub fn set_active_provider(id: &str) -> AppResult<()> {
    let mut file = load_file()?;
    if !file.providers.iter().any(|provider| provider.id == id) {
        return Err(AppError::Message(format!("AI 提供商不存在: {id}")));
    }
    file.active_provider_id = Some(id.to_string());
    save_file(&file)
}

/// Runtime credentials for the active provider (API key from keychain).
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ActiveProviderRuntime {
    pub id: String,
    pub name: String,
    pub kind: AiProviderKind,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
}

pub fn resolve_active_provider() -> AppResult<ActiveProviderRuntime> {
    let file = load_file()?;
    let active_id = file
        .active_provider_id
        .as_ref()
        .ok_or_else(|| AppError::Message("请先在设置中配置并选择 AI 提供商".into()))?;
    let provider = file
        .providers
        .into_iter()
        .find(|p| &p.id == active_id)
        .ok_or_else(|| AppError::Message("当前 AI 提供商不存在，请重新选择".into()))?;
    let api_key = credentials::get_secret(&secret_id(&provider.id), API_KEY_KIND)?;
    Ok(ActiveProviderRuntime {
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        base_url: provider.base_url,
        model: provider.model,
        api_key,
    })
}
