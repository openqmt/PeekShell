export type AiProviderKind = "openAiCompatible" | "anthropic" | "ollama";

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
