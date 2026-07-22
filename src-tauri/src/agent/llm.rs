//! OpenAI 兼容 Chat Completions（含 Ollama `/v1`）。Anthropic 暂未接入。

use super::schema::ChatHistoryMessage;
use crate::ai_config::{ActiveProviderRuntime, AiProviderKind};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: &'a [ApiMessage<'a>],
    temperature: f32,
}

#[derive(Serialize)]
struct ApiMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: Option<String>,
}

pub async fn chat_completions(
    provider: &ActiveProviderRuntime,
    messages: &[ChatHistoryMessage],
) -> AppResult<String> {
    match provider.kind {
        AiProviderKind::OpenAiCompatible | AiProviderKind::Ollama => {}
        AiProviderKind::Anthropic => {
            return Err(AppError::Message(
                "Anthropic 暂未支持，请改用 OpenAI 兼容接口或 Ollama".into(),
            ));
        }
    }

    let api_messages: Vec<ApiMessage<'_>> = messages
        .iter()
        .map(|m| ApiMessage {
            role: m.role.as_str(),
            content: m.content.as_str(),
        })
        .collect();

    let url = format!(
        "{}/chat/completions",
        provider.base_url.trim_end_matches('/')
    );
    let body = ChatRequest {
        model: &provider.model,
        messages: &api_messages,
        temperature: 0.2,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()?;

    let mut req = client.post(&url).json(&body);
    if let Some(key) = provider.api_key.as_deref().filter(|k| !k.is_empty()) {
        req = req.bearer_auth(key);
    }

    let resp = req.send().await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        return Err(AppError::Message(format!(
            "LLM 请求失败 ({status}): {}",
            truncate(&text, 500)
        )));
    }

    let parsed: ChatResponse = serde_json::from_str(&text).map_err(|e| {
        AppError::Message(format!(
            "解析 LLM 响应失败: {e}; body={}",
            truncate(&text, 300)
        ))
    })?;
    let content = parsed
        .choices
        .first()
        .and_then(|c| c.message.content.clone())
        .unwrap_or_default();
    if content.trim().is_empty() {
        return Err(AppError::Message("模型返回空内容".into()));
    }
    Ok(content)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}
