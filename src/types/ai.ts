export type AiProviderKind = "openAiCompatible" | "anthropic" | "ollama";

/** 输入框下方的命令执行策略。 */
export type ExecMode = "auto" | "confirm" | "smart";

export type RiskLevel = "low" | "medium" | "high";

export type AgentCommandStatus =
  | "suggested"
  | "pendingConfirm"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export interface AiProviderRecord {
  id: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface AiProviderUpsert {
  id?: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface AiSettings {
  providers: AiProviderRecord[];
  activeProviderId: string | null;
}

export interface AgentCommand {
  id: string;
  command: string;
  risk: RiskLevel;
  rationale: string;
  status: AgentCommandStatus;
  autoExecuted: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface AiChatResponse {
  explanation: string;
  needsMoreInfo: boolean;
  commands: AgentCommand[];
  followUp: string | null;
}

export interface ExecuteCommandResponse {
  command: AgentCommand;
  result: ExecResult;
  followUp: string | null;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  commands?: AgentCommand[];
  execResult?: ExecResult;
}
