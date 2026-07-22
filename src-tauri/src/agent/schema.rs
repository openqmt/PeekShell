//! Agent 请求/响应与 pending 命令结构。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExecMode {
    /// 全部直接执行
    Auto,
    /// 全部需确认（默认）
    Confirm,
    /// low 自动，medium/high 确认
    Smart,
}

impl Default for ExecMode {
    fn default() -> Self {
        Self::Confirm
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentCommandStatus {
    /// 未连接主机：仅展示建议，不可执行
    Suggested,
    PendingConfirm,
    Approved,
    Rejected,
    Executed,
    Failed,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatHistoryMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub session_id: String,
    pub message: String,
    #[serde(default)]
    pub exec_mode: ExecMode,
    #[serde(default)]
    pub history: Vec<ChatHistoryMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommandView {
    pub id: String,
    pub command: String,
    pub risk: RiskLevel,
    pub rationale: String,
    pub status: AgentCommandStatus,
    pub auto_executed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResponse {
    pub explanation: String,
    pub needs_more_info: bool,
    pub commands: Vec<AgentCommandView>,
    pub follow_up: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LlmAgentReply {
    #[serde(default)]
    pub explanation: String,
    #[serde(default)]
    pub needs_more_info: bool,
    #[serde(default)]
    pub commands: Vec<LlmProposedCommand>,
}

#[derive(Debug, Deserialize)]
pub struct LlmProposedCommand {
    pub command: String,
    #[serde(default = "default_risk")]
    pub risk: RiskLevel,
    #[serde(default)]
    pub rationale: String,
}

fn default_risk() -> RiskLevel {
    RiskLevel::Medium
}

#[derive(Debug, Clone)]
pub struct PendingCommand {
    pub id: String,
    pub session_id: String,
    pub command: String,
    pub risk: RiskLevel,
    pub rationale: String,
    pub exec_mode: ExecMode,
    pub status: AgentCommandStatus,
}
