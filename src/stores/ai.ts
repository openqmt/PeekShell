import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import * as api from "../api/tauri";
import type {
  AgentCommand,
  AiProviderRecord,
  AiProviderUpsert,
  ChatMessage,
  ExecMode,
} from "../types/ai";
import { useSessionsStore } from "./sessions";

const EXEC_MODE_KEY = "peekshell.execMode";

function loadExecMode(): ExecMode {
  const raw = localStorage.getItem(EXEC_MODE_KEY);
  if (raw === "auto" || raw === "confirm" || raw === "smart") return raw;
  return "confirm";
}

function newId() {
  return crypto.randomUUID();
}

export const useAiStore = defineStore("ai", () => {
  const providers = ref<AiProviderRecord[]>([]);
  const activeProviderId = ref<string | null>(null);
  const loading = ref(false);
  const sending = ref(false);
  const error = ref("");
  const messages = ref<ChatMessage[]>([]);
  const execMode = ref<ExecMode>(loadExecMode());

  const activeProvider = computed(
    () => providers.value.find((provider) => provider.id === activeProviderId.value) ?? null
  );

  watch(execMode, (mode) => {
    localStorage.setItem(EXEC_MODE_KEY, mode);
  });

  async function refresh() {
    loading.value = true;
    error.value = "";
    try {
      const settings = await api.getAiSettings();
      providers.value = settings.providers;
      activeProviderId.value = settings.activeProviderId;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function upsert(payload: AiProviderUpsert) {
    const saved = await api.upsertAiProvider(payload);
    await refresh();
    return saved;
  }

  async function remove(id: string) {
    await api.deleteAiProvider(id);
    await refresh();
  }

  async function activate(id: string) {
    await api.setActiveAiProvider(id);
    activeProviderId.value = id;
  }

  function clearChat() {
    messages.value = [];
    error.value = "";
  }

  function updateCommandInMessages(updated: AgentCommand) {
    for (const msg of messages.value) {
      if (!msg.commands) continue;
      const idx = msg.commands.findIndex((c) => c.id === updated.id);
      if (idx >= 0) {
        msg.commands[idx] = updated;
        break;
      }
    }
  }

  async function send(message: string) {
    const text = message.trim();
    if (!text || sending.value) return;

    if (!activeProvider.value) {
      error.value = "noProvider";
      return;
    }

    const sessions = useSessionsStore();
    const sessionId = sessions.activeSessionId ?? "";

    error.value = "";
    messages.value.push({ id: newId(), role: "user", content: text });
    sending.value = true;

    const history = messages.value
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await api.aiChat({
        sessionId,
        message: text,
        execMode: execMode.value,
        history,
      });

      messages.value.push({
        id: newId(),
        role: "assistant",
        content: res.explanation,
        commands: res.commands,
      });
    } catch (e) {
      error.value = String(e);
      messages.value.push({
        id: newId(),
        role: "assistant",
        content: String(e),
      });
    } finally {
      sending.value = false;
    }
  }

  async function approve(commandId: string) {
    const sessions = useSessionsStore();
    const sessionId = sessions.activeSessionId;
    if (!sessionId) return;
    try {
      const res = await api.executeApprovedCommand(sessionId, commandId);
      updateCommandInMessages(res.command);
      const parts = [
        `已执行：\`${res.command.command}\``,
        res.result.exitCode != null ? `exit ${res.result.exitCode}` : "",
        res.result.stdout?.trim() ? res.result.stdout.trim() : "",
        res.result.stderr?.trim() ? `stderr:\n${res.result.stderr.trim()}` : "",
        res.followUp?.trim() ?? "",
      ].filter(Boolean);
      messages.value.push({
        id: newId(),
        role: "assistant",
        content: parts.join("\n\n"),
        execResult: res.result,
      });
    } catch (e) {
      error.value = String(e);
    }
  }

  async function reject(commandId: string) {
    const sessions = useSessionsStore();
    const sessionId = sessions.activeSessionId;
    if (!sessionId) return;
    try {
      const updated = await api.rejectAgentCommand(sessionId, commandId);
      updateCommandInMessages(updated);
    } catch (e) {
      error.value = String(e);
    }
  }

  return {
    providers,
    activeProviderId,
    activeProvider,
    loading,
    sending,
    error,
    messages,
    execMode,
    refresh,
    upsert,
    remove,
    activate,
    clearChat,
    send,
    approve,
    reject,
  };
});
