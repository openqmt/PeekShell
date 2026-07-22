//! AI Agent：提议命令 → 按执行模式自动/确认 → 在 SSH 会话上执行 → 结果回灌。
//! 执行入口只接受已注册的 command id；前端不得直接把 AI 命令写入 PTY。

mod audit;
mod llm;
mod policy;
pub mod schema;

use crate::ai_config;
use crate::error::{AppError, AppResult};
use crate::ssh::{ExecResult, HostMetrics, SessionManager};
use policy::{decide_action, elevate_risk, ExecAction};
use schema::{
    AgentCommandStatus, AgentCommandView, AiChatRequest, AiChatResponse, ChatHistoryMessage,
    LlmAgentReply, PendingCommand,
};
use serde::Serialize;
use std::collections::HashMap;
use tauri::AppHandle;
use tokio::sync::Mutex;
use uuid::Uuid;

const PTY_CONTEXT_CHARS: usize = 6_000;
const OUTPUT_FEEDBACK_CHARS: usize = 4_000;
const TERMINAL_ECHO_CHARS: usize = 8_000;

pub struct AgentState {
    pending: Mutex<HashMap<String, PendingCommand>>,
}

impl AgentState {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCommandResponse {
    pub command: AgentCommandView,
    pub result: ExecResult,
    pub follow_up: Option<String>,
}

/// 用户提问：组装上下文 → LLM → 有会话时按模式自动/确认执行；无会话仅返回建议命令。
pub async fn chat(
    app: &AppHandle,
    agent: &AgentState,
    sessions: &SessionManager,
    req: AiChatRequest,
) -> AppResult<AiChatResponse> {
    let message = req.message.trim();
    if message.is_empty() {
        return Err(AppError::Message("请输入问题".into()));
    }

    let provider = ai_config::resolve_active_provider()?;
    let session_id = req.session_id.trim();
    let has_session = !session_id.is_empty();

    let context = if has_session {
        let host = sessions.host_record_for_session(session_id).await?;
        let metrics = sessions.metrics(session_id).await.ok();
        let pty_tail = sessions
            .pty_output_tail(session_id, PTY_CONTEXT_CHARS)
            .await
            .unwrap_or_default();
        build_context(&host.name, &host.host, metrics.as_ref(), &pty_tail)
    } else {
        "No SSH session connected. You may still answer questions and suggest commands, but they cannot be executed until the user connects a host.".to_string()
    };

    let mut messages = vec![
        ChatHistoryMessage {
            role: "system".into(),
            content: system_prompt(),
        },
        ChatHistoryMessage {
            role: "system".into(),
            content: format!("Session context:\n{context}"),
        },
    ];
    for item in req
        .history
        .iter()
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
    {
        if item.role == "user" || item.role == "assistant" {
            messages.push(ChatHistoryMessage {
                role: item.role.clone(),
                content: item.content.clone(),
            });
        }
    }
    messages.push(ChatHistoryMessage {
        role: "user".into(),
        content: message.to_string(),
    });

    let request_id = if req.request_id.trim().is_empty() {
        Uuid::new_v4().to_string()
    } else {
        req.request_id.trim().to_string()
    };

    let raw = llm::chat_completions_stream(app, &request_id, &provider, &messages).await?;
    let parsed = parse_agent_reply(&raw)?;

    let mut commands = Vec::new();
    let mut auto_results = Vec::new();

    if !parsed.needs_more_info {
        for proposed in parsed.commands {
            let command_text = proposed.command.trim().to_string();
            if command_text.is_empty() {
                continue;
            }
            let risk = elevate_risk(&command_text, proposed.risk);
            let id = Uuid::new_v4().to_string();

            // 未连接主机：只展示建议，绝不执行、不进入 pending 注册表
            if !has_session {
                commands.push(AgentCommandView {
                    id,
                    command: command_text,
                    risk,
                    rationale: proposed.rationale.clone(),
                    status: AgentCommandStatus::Suggested,
                    auto_executed: false,
                });
                continue;
            }

            let action = decide_action(req.exec_mode, risk);
            let mut pending = PendingCommand {
                id: id.clone(),
                session_id: session_id.to_string(),
                command: command_text.clone(),
                risk,
                rationale: proposed.rationale.clone(),
                exec_mode: req.exec_mode,
                status: AgentCommandStatus::PendingConfirm,
            };

            match action {
                ExecAction::AutoExecute => {
                    let result = sessions.exec_command(session_id, &command_text).await;
                    match result {
                        Ok(exec) => {
                            let _ = echo_exec_to_terminal(
                                app,
                                sessions,
                                session_id,
                                &command_text,
                                Some(&exec),
                                None,
                            )
                            .await;
                            pending.status = AgentCommandStatus::Executed;
                            audit::append(
                                session_id,
                                &command_text,
                                risk,
                                req.exec_mode,
                                true,
                                "executed",
                                Some(&exec),
                            );
                            auto_results.push((command_text.clone(), exec));
                            commands.push(command_view(&pending, true));
                        }
                        Err(err) => {
                            let _ = echo_exec_to_terminal(
                                app,
                                sessions,
                                session_id,
                                &command_text,
                                None,
                                Some(&err.to_string()),
                            )
                            .await;
                            pending.status = AgentCommandStatus::Failed;
                            audit::append(
                                session_id,
                                &command_text,
                                risk,
                                req.exec_mode,
                                true,
                                &format!("failed: {err}"),
                                None,
                            );
                            commands.push(command_view(&pending, true));
                        }
                    }
                    agent.pending.lock().await.insert(id, pending);
                }
                ExecAction::RequireConfirm => {
                    pending.status = AgentCommandStatus::PendingConfirm;
                    audit::append(
                        session_id,
                        &command_text,
                        risk,
                        req.exec_mode,
                        false,
                        "pending_confirm",
                        None,
                    );
                    commands.push(command_view(&pending, false));
                    agent.pending.lock().await.insert(id, pending);
                }
            }
        }
    }

    let mut explanation = parsed.explanation.trim().to_string();
    if explanation.is_empty() && commands.is_empty() {
        explanation = raw.trim().to_string();
    }

    let follow_up = if !auto_results.is_empty() {
        match feedback_after_runs(&provider, message, &auto_results).await {
            Ok(text) => {
                if !text.is_empty() {
                    explanation = format!("{explanation}\n\n{text}");
                }
                Some(text)
            }
            Err(_) => None,
        }
    } else {
        None
    };

    Ok(AiChatResponse {
        explanation,
        needs_more_info: parsed.needs_more_info,
        commands,
        follow_up,
    })
}

/// 用户确认后执行挂起的命令（仅 PendingConfirm）。
pub async fn execute_approved(
    app: &AppHandle,
    agent: &AgentState,
    sessions: &SessionManager,
    session_id: &str,
    command_id: &str,
) -> AppResult<ExecuteCommandResponse> {
    let pending = {
        let mut map = agent.pending.lock().await;
        let cmd = map
            .get_mut(command_id)
            .ok_or_else(|| AppError::Message("待确认命令不存在或已失效".into()))?;
        if cmd.session_id != session_id {
            return Err(AppError::Message("命令与当前会话不匹配".into()));
        }
        if cmd.status != AgentCommandStatus::PendingConfirm {
            return Err(AppError::Message("该命令不可再确认执行".into()));
        }
        cmd.status = AgentCommandStatus::Approved;
        cmd.clone()
    };

    let result = sessions.exec_command(session_id, &pending.command).await;
    let provider = ai_config::resolve_active_provider().ok();

    match result {
        Ok(exec) => {
            let _ = echo_exec_to_terminal(
                app,
                sessions,
                session_id,
                &pending.command,
                Some(&exec),
                None,
            )
            .await;
            {
                let mut map = agent.pending.lock().await;
                if let Some(cmd) = map.get_mut(command_id) {
                    cmd.status = AgentCommandStatus::Executed;
                }
            }
            audit::append(
                session_id,
                &pending.command,
                pending.risk,
                pending.exec_mode,
                false,
                "executed",
                Some(&exec),
            );
            let follow_up = if let Some(p) = provider.as_ref() {
                feedback_after_runs(
                    p,
                    &pending.command,
                    &[(pending.command.clone(), exec.clone())],
                )
                .await
                .ok()
            } else {
                None
            };
            let view = {
                let map = agent.pending.lock().await;
                map.get(command_id)
                    .map(|c| command_view(c, false))
                    .unwrap_or_else(|| command_view(&pending, false))
            };
            Ok(ExecuteCommandResponse {
                command: view,
                result: exec,
                follow_up,
            })
        }
        Err(err) => {
            let _ = echo_exec_to_terminal(
                app,
                sessions,
                session_id,
                &pending.command,
                None,
                Some(&err.to_string()),
            )
            .await;
            {
                let mut map = agent.pending.lock().await;
                if let Some(cmd) = map.get_mut(command_id) {
                    cmd.status = AgentCommandStatus::Failed;
                }
            }
            audit::append(
                session_id,
                &pending.command,
                pending.risk,
                pending.exec_mode,
                false,
                &format!("failed: {err}"),
                None,
            );
            Err(err)
        }
    }
}

/// 用户拒绝挂起的命令。
pub async fn reject_command(
    agent: &AgentState,
    session_id: &str,
    command_id: &str,
) -> AppResult<AgentCommandView> {
    let mut map = agent.pending.lock().await;
    let cmd = map
        .get_mut(command_id)
        .ok_or_else(|| AppError::Message("待确认命令不存在或已失效".into()))?;
    if cmd.session_id != session_id {
        return Err(AppError::Message("命令与当前会话不匹配".into()));
    }
    if cmd.status != AgentCommandStatus::PendingConfirm {
        return Err(AppError::Message("该命令不可拒绝".into()));
    }
    cmd.status = AgentCommandStatus::Rejected;
    audit::append(
        session_id,
        &cmd.command,
        cmd.risk,
        cmd.exec_mode,
        false,
        "rejected",
        None,
    );
    Ok(command_view(cmd, false))
}

fn command_view(cmd: &PendingCommand, auto_executed: bool) -> AgentCommandView {
    AgentCommandView {
        id: cmd.id.clone(),
        command: cmd.command.clone(),
        risk: cmd.risk,
        rationale: cmd.rationale.clone(),
        status: cmd.status,
        auto_executed,
    }
}

fn system_prompt() -> String {
    r#"You are PeekShell Agent, an SSH assistant.

Reply in this exact format:
1) First write a clear natural-language explanation for the user (plain text / markdown). Do NOT start with JSON.
2) Then append a JSON block for machine parsing, fenced like:

```json
{
  "needs_more_info": false,
  "commands": [
    { "command": "shell command", "risk": "low|medium|high", "rationale": "why this command" }
  ]
}
```

Rules:
- Prefer read-only diagnostics first. Never claim you already executed anything.
- risk=low: safe read-only (ls, cat, df, free, systemctl status, journalctl without delete).
- risk=medium: state-changing but reversible-ish (restart service, apt install, chmod on user files).
- risk=high: destructive or privilege/network-wide (rm -rf, mkfs, firewall flush, drop DB, write /etc).
- If unclear, set needs_more_info=true and commands=[].
- commands should be non-interactive; avoid editors/pagers (no vim/less). Use absolute paths when helpful.
- The JSON must be valid. Keep the explanation outside the fence.
"#
    .to_string()
}

fn build_context(
    host_name: &str,
    host_ip: &str,
    metrics: Option<&HostMetrics>,
    pty_tail: &str,
) -> String {
    let mut lines = vec![
        format!("Host name: {host_name}"),
        format!("Host address: {host_ip}"),
    ];
    if let Some(m) = metrics {
        lines.push(format!(
            "OS: {} | kernel: {} | arch: {} | hostname: {}",
            m.os, m.kernel, m.arch, m.hostname
        ));
        lines.push(format!(
            "Uptime: {} | load: {} | CPU: {:.0}% | mem: {:.1}/{:.1} GiB",
            m.uptime_text, m.load_avg, m.cpu_percent, m.mem_used_gi_b, m.mem_total_gi_b
        ));
    }
    let redacted = redact_secrets(pty_tail);
    lines.push("Recent terminal output:".into());
    lines.push(if redacted.trim().is_empty() {
        "(empty)".into()
    } else {
        redacted
    });
    lines.join("\n")
}

fn redact_secrets(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        let lower = line.to_lowercase();
        if lower.contains("password=")
            || lower.contains("passwd=")
            || lower.contains("-----begin")
            || lower.contains("api_key")
            || lower.contains("apikey")
            || lower.contains("secret=")
        {
            out.push_str("[redacted]\n");
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

fn parse_agent_reply(raw: &str) -> AppResult<LlmAgentReply> {
    let trimmed = raw.trim();

    // 优先：说明文字 + ```json ... ```
    if let Some((explanation, json_part)) = split_explanation_and_json(trimmed) {
        if let Ok(mut parsed) = serde_json::from_str::<LlmAgentReply>(json_part) {
            if parsed.explanation.trim().is_empty() {
                parsed.explanation = explanation.trim().to_string();
            }
            return Ok(parsed);
        }
        if let Some(obj) = extract_json_object(json_part) {
            if let Ok(mut parsed) = serde_json::from_str::<LlmAgentReply>(obj) {
                if parsed.explanation.trim().is_empty() {
                    parsed.explanation = explanation.trim().to_string();
                }
                return Ok(parsed);
            }
        }
    }

    // 兼容旧格式：整段就是 JSON
    if let Ok(parsed) = serde_json::from_str::<LlmAgentReply>(trimmed) {
        return Ok(parsed);
    }
    if let Some(obj) = extract_json_object(trimmed) {
        if let Ok(parsed) = serde_json::from_str::<LlmAgentReply>(obj) {
            return Ok(parsed);
        }
    }

    Ok(LlmAgentReply {
        explanation: strip_json_fence_tail(trimmed),
        needs_more_info: false,
        commands: vec![],
    })
}

fn split_explanation_and_json(raw: &str) -> Option<(String, &str)> {
    let lower = raw.to_ascii_lowercase();
    let marker = "```json";
    if let Some(idx) = lower.find(marker) {
        let explanation = raw[..idx].to_string();
        let after = &raw[idx + marker.len()..];
        let json_body = after.split("```").next().unwrap_or(after).trim();
        return Some((explanation, json_body));
    }
    // 无 fence：尝试最后一个 { ... }
    if let Some(start) = raw.rfind('{') {
        if let Some(end) = raw.rfind('}') {
            if end > start {
                return Some((raw[..start].to_string(), &raw[start..=end]));
            }
        }
    }
    None
}

fn extract_json_object(raw: &str) -> Option<&str> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end > start {
        Some(&raw[start..=end])
    } else {
        None
    }
}

fn strip_json_fence_tail(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if let Some(idx) = lower.find("```json") {
        return raw[..idx].trim().to_string();
    }
    raw.trim().to_string()
}

async fn feedback_after_runs(
    provider: &ai_config::ActiveProviderRuntime,
    user_goal: &str,
    runs: &[(String, ExecResult)],
) -> AppResult<String> {
    let mut body = String::from("Summarize these command results for the user in plain language. If another safe next step is obvious, mention it but do not pretend it was executed.\n");
    body.push_str(&format!("User goal: {user_goal}\n"));
    for (cmd, exec) in runs {
        let stdout = truncate(&exec.stdout, OUTPUT_FEEDBACK_CHARS / 2);
        let stderr = truncate(&exec.stderr, OUTPUT_FEEDBACK_CHARS / 4);
        body.push_str(&format!(
            "Command: {cmd}\nExit: {:?}\nStdout:\n{stdout}\nStderr:\n{stderr}\n---\n",
            exec.exit_code
        ));
    }
    let messages = vec![
        ChatHistoryMessage {
            role: "system".into(),
            content: "You are PeekShell Agent. Reply with a short plain-text explanation only (no JSON).".into(),
        },
        ChatHistoryMessage {
            role: "user".into(),
            content: body,
        },
    ];
    llm::chat_completions(provider, &messages).await
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect::<String>() + "…"
    }
}

/// 把 Agent 执行过程回显到 xterm（只显示，不写入远端 shell），
/// 随后向交互式 PTY 发送 Ctrl+U + Enter，让 shell 重新打出提示符。
async fn echo_exec_to_terminal(
    app: &AppHandle,
    sessions: &SessionManager,
    session_id: &str,
    command: &str,
    result: Option<&ExecResult>,
    error: Option<&str>,
) -> AppResult<()> {
    let text = format_terminal_echo(command, result, error);
    sessions.mirror_display_output(app, session_id, &text).await?;
    // \x15 = Ctrl+U 清空当前输入行，避免误提交用户半成品输入；\n 触发新提示符
    let _ = sessions.write(session_id, "\x15\n").await;
    Ok(())
}

fn format_terminal_echo(command: &str, result: Option<&ExecResult>, error: Option<&str>) -> String {
    let mut out = String::new();
    out.push_str("\r\n\x1b[2m── PeekShell Agent ──\x1b[0m\r\n");
    out.push_str("\x1b[1;36m$ ");
    out.push_str(&to_term_lines(command));
    out.push_str("\x1b[0m\r\n");

    if let Some(err) = error {
        out.push_str("\x1b[31m");
        out.push_str(&to_term_lines(err));
        out.push_str("\x1b[0m\r\n");
        return out;
    }

    if let Some(exec) = result {
        let stdout = truncate(&exec.stdout, TERMINAL_ECHO_CHARS);
        let stderr = truncate(&exec.stderr, TERMINAL_ECHO_CHARS / 2);
        if !stdout.is_empty() {
            out.push_str(&to_term_lines(&stdout));
            if !stdout.ends_with('\n') {
                out.push_str("\r\n");
            }
        }
        if !stderr.is_empty() {
            out.push_str("\x1b[31m");
            out.push_str(&to_term_lines(&stderr));
            out.push_str("\x1b[0m");
            if !stderr.ends_with('\n') {
                out.push_str("\r\n");
            }
        }
        match exec.exit_code {
            Some(0) => out.push_str("\x1b[2m[exit 0]\x1b[0m\r\n"),
            Some(code) => out.push_str(&format!("\x1b[33m[exit {code}]\x1b[0m\r\n")),
            None => out.push_str("\x1b[2m[done]\x1b[0m\r\n"),
        }
    }
    out
}

fn to_term_lines(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', "\r\n")
}
