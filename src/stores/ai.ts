import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
import { useUiStore } from "./ui";

const EXEC_MODE_KEY = "peekshell.execMode";

function loadExecMode(): ExecMode {
  const raw = localStorage.getItem(EXEC_MODE_KEY);
  if (raw === "auto" || raw === "confirm" || raw === "smart") return raw;
  return "confirm";
}

function newId() {
  return crypto.randomUUID();
}

/** 流式过程中隐藏末尾 JSON，只展示给人看的说明。 */
export function visibleStreamText(raw: string): string {
  const lower = raw.toLowerCase();
  const fence = lower.indexOf("```json");
  if (fence >= 0) return raw.slice(0, fence).trimEnd();
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("{")) return "";
  return raw;
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

  const activeModel = computed(() => activeProvider.value?.activeModel ?? "");

  const modelOptions = computed(() =>
    (activeProvider.value?.models ?? []).map((model) => ({ value: model, label: model }))
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

  async function setActiveModel(model: string) {
    const saved = await api.setActiveAiModel(model);
    const idx = providers.value.findIndex((p) => p.id === saved.id);
    if (idx >= 0) providers.value[idx] = saved;
    else await refresh();
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
    const requestId = newId();
    const assistantId = newId();

    error.value = "";
    messages.value.push({ id: newId(), role: "user", content: text });
    messages.value.push({
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    });
    sending.value = true;

    const history = messages.value
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -2)
      .map((m) => ({ role: m.role, content: m.content }));

    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<{ requestId: string; delta: string }>("ai://chunk", (event) => {
        if (event.payload.requestId !== requestId) return;
        const msg = messages.value.find((m) => m.id === assistantId);
        if (!msg) return;
        msg.content += event.payload.delta;
      });

      const res = await api.aiChat({
        sessionId,
        message: text,
        execMode: execMode.value,
        history,
        requestId,
        locale: useUiStore().locale,
      });

      const msg = messages.value.find((m) => m.id === assistantId);
      if (msg) {
        msg.content = res.explanation;
        msg.commands = res.commands;
        msg.streaming = false;
      }
    } catch (e) {
      error.value = String(e);
      const msg = messages.value.find((m) => m.id === assistantId);
      if (msg) {
        msg.content = msg.content.trim() || String(e);
        msg.streaming = false;
      } else {
        messages.value.push({
          id: newId(),
          role: "assistant",
          content: String(e),
        });
      }
    } finally {
      if (unlisten) unlisten();
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
    activeModel,
    modelOptions,
    loading,
    sending,
    error,
    messages,
    execMode,
    refresh,
    upsert,
    remove,
    activate,
    setActiveModel,
    clearChat,
    send,
    approve,
    reject,
  };
});
