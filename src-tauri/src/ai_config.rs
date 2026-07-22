//! AI provider configuration. API keys live in the OS keychain, never in JSON.
//! 每个提供商可配置多个模型；当前选用的模型写在提供商的 `active_model` 上。

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
    /// 新格式：多模型列表
    #[serde(default)]
    models: Vec<String>,
    /// 当前选中的模型（须属于 models）
    #[serde(default)]
    active_model: Option<String>,
    /// 旧格式兼容：单模型字段
    #[serde(default)]
    model: Option<String>,
}

impl StoredProvider {
    fn normalized(mut self) -> Self {
        if self.models.is_empty() {
            if let Some(legacy) = self.model.take() {
                let trimmed = legacy.trim().to_string();
                if !trimmed.is_empty() {
                    self.models.push(trimmed);
                }
            }
        } else {
            self.models = self
                .models
                .into_iter()
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty())
                .collect();
            // 去重保序
            let mut seen = std::collections::HashSet::new();
            self.models.retain(|m| seen.insert(m.clone()));
        }
        self.model = None;
        if self.active_model.as_ref().is_none_or(|m| !self.models.iter().any(|x| x == m)) {
            self.active_model = self.models.first().cloned();
        }
        self
    }

    fn current_model(&self) -> Option<&str> {
        self.active_model
            .as_deref()
            .or_else(|| self.models.first().map(String::as_str))
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderRecord {
    pub id: String,
    pub name: String,
    pub kind: AiProviderKind,
    pub base_url: String,
    pub models: Vec<String>,
    pub active_model: String,
    pub has_api_key: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderUpsert {
    pub id: Option<String>,
    pub name: String,
    pub kind: AiProviderKind,
    pub base_url: String,
    pub models: Vec<String>,
    pub active_model: Option<String>,
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
    let mut file: AiConfigFile = serde_json::from_str(&fs::read_to_string(path)?)?;
    file.providers = file.providers.into_iter().map(|p| p.normalized()).collect();
    Ok(file)
}

fn save_file(file: &AiConfigFile) -> AppResult<()> {
    fs::write(store_path()?, serde_json::to_string_pretty(file)?)?;
    Ok(())
}

fn secret_id(provider_id: &str) -> String {
    format!("ai-provider/{provider_id}")
}

fn normalize_models(models: &[String]) -> AppResult<Vec<String>> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for model in models {
        let trimmed = model.trim();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            out.push(trimmed.to_string());
        }
    }
    if out.is_empty() {
        return Err(AppError::Message("至少配置一个模型".into()));
    }
    Ok(out)
}

fn to_record(provider: StoredProvider) -> AppResult<AiProviderRecord> {
    let provider = provider.normalized();
    let has_api_key = credentials::get_secret(&secret_id(&provider.id), API_KEY_KIND)?.is_some();
    let active_model = provider
        .current_model()
        .ok_or_else(|| AppError::Message("提供商未配置模型".into()))?
        .to_string();
    Ok(AiProviderRecord {
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        base_url: provider.base_url,
        models: provider.models,
        active_model,
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
    let models = normalize_models(&payload.models)?;
    if name.is_empty() || base_url.is_empty() {
        return Err(AppError::Message("名称和 Base URL 不能为空".into()));
    }
    if !(base_url.starts_with("http://") || base_url.starts_with("https://")) {
        return Err(AppError::Message(
            "Base URL 必须以 http:// 或 https:// 开头".into(),
        ));
    }

    let active_model = payload
        .active_model
        .as_deref()
        .map(str::trim)
        .filter(|m| !m.is_empty() && models.iter().any(|x| x == m))
        .unwrap_or(models[0].as_str())
        .to_string();

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
        models,
        active_model: Some(active_model),
        model: None,
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

/// 切换当前提供商下的选用模型。
pub fn set_active_model(model: &str) -> AppResult<AiProviderRecord> {
    let model = model.trim();
    if model.is_empty() {
        return Err(AppError::Message("模型不能为空".into()));
    }
    let mut file = load_file()?;
    let active_id = file
        .active_provider_id
        .clone()
        .ok_or_else(|| AppError::Message("请先在设置中配置并选择 AI 提供商".into()))?;
    let provider = file
        .providers
        .iter_mut()
        .find(|p| p.id == active_id)
        .ok_or_else(|| AppError::Message("当前 AI 提供商不存在，请重新选择".into()))?;
    *provider = provider.clone().normalized();
    if !provider.models.iter().any(|m| m == model) {
        return Err(AppError::Message(format!("模型不在当前提供商列表中: {model}")));
    }
    provider.active_model = Some(model.to_string());
    let saved = provider.clone();
    save_file(&file)?;
    to_record(saved)
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
        .map(|p| p.normalized())
        .find(|p| &p.id == active_id)
        .ok_or_else(|| AppError::Message("当前 AI 提供商不存在，请重新选择".into()))?;
    let model = provider
        .current_model()
        .ok_or_else(|| AppError::Message("请先为当前提供商配置模型".into()))?
        .to_string();
    let api_key = credentials::get_secret(&secret_id(&provider.id), API_KEY_KIND)?;
    Ok(ActiveProviderRuntime {
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        base_url: provider.base_url,
        model,
        api_key,
    })
}
