//! OpenAI 兼容 Chat Completions（含 Ollama `/v1`）。Anthropic 暂未接入。
//! 主对话走 SSE 流式；结果回灌等短调用仍可用非流式。

use super::schema::ChatHistoryMessage;
use crate::ai_config::{ActiveProviderRuntime, AiProviderKind};
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: &'a [ApiMessage<'a>],
    temperature: f32,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiStreamChunk {
    request_id: String,
    delta: String,
}

pub async fn chat_completions(
    provider: &ActiveProviderRuntime,
    messages: &[ChatHistoryMessage],
) -> AppResult<String> {
    ensure_supported(provider)?;
    let (client, url, api_messages) = prepare(provider, messages)?;
    let body = ChatRequest {
        model: &provider.model,
        messages: &api_messages,
        temperature: 0.2,
        stream: false,
    };

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

/// SSE 流式补全：边收边通过 `ai://chunk` 推送，最终返回完整文本。
pub async fn chat_completions_stream(
    app: &AppHandle,
    request_id: &str,
    provider: &ActiveProviderRuntime,
    messages: &[ChatHistoryMessage],
) -> AppResult<String> {
    ensure_supported(provider)?;
    let (client, url, api_messages) = prepare(provider, messages)?;
    let body = ChatRequest {
        model: &provider.model,
        messages: &api_messages,
        temperature: 0.2,
        stream: true,
    };

    let mut req = client.post(&url).json(&body);
    if let Some(key) = provider.api_key.as_deref().filter(|k| !k.is_empty()) {
        req = req.bearer_auth(key);
    }

    let resp = req.send().await?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Message(format!(
            "LLM 请求失败 ({status}): {}",
            truncate(&text, 500)
        )));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut full = String::new();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| AppError::Message(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let mut line = buffer[..pos].to_string();
            buffer.drain(..=pos);
            if line.ends_with('\r') {
                line.pop();
            }
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                return Ok(full);
            }
            if let Some(delta) = extract_delta(data) {
                if !delta.is_empty() {
                    full.push_str(&delta);
                    let _ = app.emit(
                        "ai://chunk",
                        AiStreamChunk {
                            request_id: request_id.to_string(),
                            delta,
                        },
                    );
                }
            }
        }
    }

    if full.trim().is_empty() {
        return Err(AppError::Message("模型返回空内容".into()));
    }
    Ok(full)
}

fn ensure_supported(provider: &ActiveProviderRuntime) -> AppResult<()> {
    match provider.kind {
        AiProviderKind::OpenAiCompatible | AiProviderKind::Ollama => Ok(()),
        AiProviderKind::Anthropic => Err(AppError::Message(
            "Anthropic 暂未支持，请改用 OpenAI 兼容接口或 Ollama".into(),
        )),
    }
}

fn prepare<'a>(
    provider: &'a ActiveProviderRuntime,
    messages: &'a [ChatHistoryMessage],
) -> AppResult<(reqwest::Client, String, Vec<ApiMessage<'a>>)> {
    let api_messages: Vec<ApiMessage<'a>> = messages
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
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()?;
    Ok((client, url, api_messages))
}

fn extract_delta(data: &str) -> Option<String> {
    let value: Value = serde_json::from_str(data).ok()?;
    let delta = value
        .pointer("/choices/0/delta/content")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    if delta.as_ref().is_some_and(|s| !s.is_empty()) {
        return delta;
    }
    // 少数兼容实现把增量放在 message.content
    value
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect::<String>() + "…"
    }
}
