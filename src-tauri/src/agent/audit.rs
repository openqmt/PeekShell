//! 本地 AI 审计日志（JSONL），记录提议/确认/自动执行与结果摘要。

use super::schema::{ExecMode, RiskLevel};
use crate::ssh::ExecResult;
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditLine<'a> {
    ts: String,
    session_id: &'a str,
    command: &'a str,
    risk: RiskLevel,
    exec_mode: ExecMode,
    auto_executed: bool,
    outcome: &'a str,
    exit_code: Option<u32>,
    stdout_preview: Option<String>,
}

fn audit_path() -> Option<PathBuf> {
    let base = dirs::data_dir()?;
    let dir = base.join("PeekShell");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("ai-audit.jsonl"))
}

pub fn append(
    session_id: &str,
    command: &str,
    risk: RiskLevel,
    exec_mode: ExecMode,
    auto_executed: bool,
    outcome: &str,
    result: Option<&ExecResult>,
) {
    let Some(path) = audit_path() else {
        return;
    };
    let line = AuditLine {
        ts: chrono::Utc::now().to_rfc3339(),
        session_id,
        command,
        risk,
        exec_mode,
        auto_executed,
        outcome,
        exit_code: result.and_then(|r| r.exit_code),
        stdout_preview: result.map(|r| truncate(&r.stdout, 240)),
    };
    let Ok(json) = serde_json::to_string(&line) else {
        return;
    };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{json}");
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect::<String>() + "…"
    }
}
