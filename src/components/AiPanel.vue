<script setup lang="ts">
/**
 * AI 助手面板：自然语言提问 → 按执行模式自动/确认执行命令。
 */
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "../i18n";
import { useAiStore, visibleStreamText } from "../stores/ai";
import { useSessionsStore } from "../stores/sessions";
import { useUiStore, AI_PANEL_WIDTH_MAX, AI_PANEL_WIDTH_MIN } from "../stores/ui";
import type { ExecMode } from "../types/ai";
import AppSelect from "./AppSelect.vue";
import CommandApproveCard from "./CommandApproveCard.vue";

const ai = useAiStore();
const ui = useUiStore();
const sessions = useSessionsStore();
const { t } = useI18n();
const { aiCollapsed, aiPanelWidth } = storeToRefs(ui);
const { activeProvider, activeModel, modelOptions, messages, sending, execMode, error } =
  storeToRefs(ai);
const { activeSessionId } = storeToRefs(sessions);

const draft = ref("");
const chatEl = ref<HTMLElement | null>(null);
const approvingId = ref<string | null>(null);
const resizing = ref(false);

const canCompose = computed(() => !!activeProvider.value);

const canSend = computed(
  () => canCompose.value && !!draft.value.trim() && !sending.value
);

const modeOptions = computed(() => [
  { value: "confirm", label: t("ai.mode.confirm") },
  { value: "smart", label: t("ai.mode.smart") },
  { value: "auto", label: t("ai.mode.auto") },
]);

const blockerText = computed(() => {
  if (!activeProvider.value) return t("ai.err.noProvider");
  return "";
});

const sessionHint = computed(() => {
  if (activeProvider.value && !activeSessionId.value) return t("ai.hint.noSession");
  return "";
});

async function onModelChange(value: string) {
  if (!value || value === activeModel.value) return;
  try {
    await ai.setActiveModel(value);
  } catch (e) {
    error.value = String(e);
  }
}

const errorText = computed(() => {
  if (error.value === "noProvider") return t("ai.err.noProvider");
  if (error.value) return error.value;
  return "";
});

watch(
  messages,
  async () => {
    await nextTick();
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
  },
  { deep: true }
);

async function onSend() {
  const text = draft.value;
  if (!canSend.value) return;
  draft.value = "";
  await ai.send(text);
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    void onSend();
  }
}

async function onApprove(id: string) {
  approvingId.value = id;
  try {
    await ai.approve(id);
  } finally {
    approvingId.value = null;
  }
}

async function onReject(id: string) {
  approvingId.value = id;
  try {
    await ai.reject(id);
  } finally {
    approvingId.value = null;
  }
}

function onModeChange(value: string) {
  execMode.value = value as ExecMode;
}

function onResizeStart(ev: MouseEvent) {
  if (ev.button !== 0 || aiCollapsed.value) return;
  ev.preventDefault();
  resizing.value = true;
  const startX = ev.clientX;
  const startWidth = aiPanelWidth.value;
  document.documentElement.classList.add("is-resizing-ai");
  const workspace = document.querySelector(".workspace");
  workspace?.classList.add("is-resizing-ai");

  function onMove(moveEv: MouseEvent) {
    // 向左拖变宽，向右拖变窄
    const next = startWidth + (startX - moveEv.clientX);
    ui.setAiPanelWidth(Math.min(AI_PANEL_WIDTH_MAX, Math.max(AI_PANEL_WIDTH_MIN, next)));
  }

  function onUp() {
    resizing.value = false;
    document.documentElement.classList.remove("is-resizing-ai");
    workspace?.classList.remove("is-resizing-ai");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.dispatchEvent(new Event("resize"));
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

onBeforeUnmount(() => {
  document.documentElement.classList.remove("is-resizing-ai");
  document.querySelector(".workspace")?.classList.remove("is-resizing-ai");
});
</script>

<template>
  <aside class="ai-panel" :class="{ resizing }">
    <div
      v-if="!aiCollapsed"
      class="ai-resize-handle"
      :title="t('ai.resize')"
      @mousedown="onResizeStart"
    />
    <div v-if="!aiCollapsed" class="ai-head">
      <div class="ai-head-left">
        <h2>{{ t("ai.title") }}</h2>
      </div>
      <div class="ai-head-right">
        <AppSelect
          v-if="activeProvider"
          class="model-select"
          :model-value="activeModel"
          :options="modelOptions"
          :disabled="sending || modelOptions.length <= 1"
          :placeholder="t('ai.notConfigured')"
          @update:model-value="onModelChange"
        />
        <span v-else class="model-tag">{{ t("ai.notConfigured") }}</span>
        <div class="ai-head-actions">
          <button
            class="icon-btn"
            type="button"
            :title="t('ai.clear')"
            :aria-label="t('ai.clear')"
            :disabled="!messages.length"
            @click="ai.clearChat()"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M3.5 5h9M6 5V3.8h4V5M5.2 5l.5 7.2h4.6L10.8 5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button class="icon-btn" type="button" :title="t('ai.configure')" @click="ui.openAiSettingsModal()">
            ⚙
          </button>
          <button class="icon-btn" type="button" :title="t('ai.collapse')" @click="aiCollapsed = true">
            »
          </button>
        </div>
      </div>
    </div>

    <div v-if="aiCollapsed" class="ai-rail">
      <button class="icon-btn" type="button" :title="t('ai.expand')" @click="aiCollapsed = false">«</button>
      <span class="rail-dot" />
      <span class="rail-ai-label">AI</span>
    </div>

    <div v-else class="ai-body">
      <div ref="chatEl" class="chat">
        <div v-if="!messages.length" class="msg assistant">
          <div class="msg-inner">
            <div class="role">PeekShell Agent</div>
            <div class="content">
              <template v-if="activeProvider">
                {{ t("ai.ready", { name: activeProvider.name, model: activeModel }) }}
              </template>
              <template v-else>
                {{ t("ai.setup") }}
              </template>
            </div>
          </div>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="msg"
          :class="msg.role"
        >
          <div class="msg-inner">
            <div v-if="msg.role !== 'user'" class="role">PeekShell Agent</div>
            <div class="content">
              <template v-if="msg.streaming && !visibleStreamText(msg.content)">
                {{ t("ai.thinking") }}
              </template>
              <template v-else>
                {{ msg.streaming ? visibleStreamText(msg.content) : msg.content }}
              </template>
              <span v-if="msg.streaming" class="stream-caret" />
            </div>
            <CommandApproveCard
              v-for="cmd in msg.commands || []"
              :key="cmd.id"
              :command="cmd"
              :busy="approvingId === cmd.id || sending"
              @approve="onApprove(cmd.id)"
              @reject="onReject(cmd.id)"
            />
          </div>
        </div>
      </div>

      <div class="composer">
        <p v-if="errorText || blockerText" class="err">{{ errorText || blockerText }}</p>
        <p v-else-if="sessionHint" class="hint-warn">{{ sessionHint }}</p>
        <textarea
          v-model="draft"
          class="composer-box"
          rows="3"
          :placeholder="t('ai.placeholder')"
          :disabled="!canCompose || sending"
          @keydown="onKeydown"
        />
        <div class="composer-bar">
          <AppSelect
            v-model="execMode"
            class="mode-select"
            :options="modeOptions"
            :disabled="sending"
            @change="onModeChange"
          />
          <button
            class="send"
            type="button"
            :disabled="!canSend"
            :title="blockerText || undefined"
            @click="onSend"
          >
            {{ sending ? t("ai.sending") : t("ai.send") }}
          </button>
        </div>
        <span class="hint">{{ t("ai.context") }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ai-panel {
  position: relative;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.ai-resize-handle {
  position: absolute;
  top: 0;
  left: -3px;
  z-index: 5;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
}

.ai-head {
  padding: 4px 6px 4px 10px;
  min-height: 36px;
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.ai-head-left,
.ai-head-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-head-actions {
  display: flex;
  align-items: center;
  gap: 0;
}

.ai-head h2 {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-head h2::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.model-tag {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-dim);
  border: 1px solid var(--border);
  padding: 3px 7px;
  border-radius: 4px;
}

.model-select {
  width: min(160px, 42vw);
  flex-shrink: 1;
}

.model-select :deep(.app-select-trigger) {
  min-height: 26px;
  height: 26px;
  padding: 0 8px;
  font-size: 11px;
  font-family: var(--font-mono);
}

.ai-rail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0 10px;
  gap: 6px;
}

.rail-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.rail-ai-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.ai-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat {
  flex: 1;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msg {
  display: flex;
  width: 100%;
  font-size: 12.5px;
  line-height: 1.5;
}

.msg.user {
  justify-content: flex-end;
}

.msg.assistant {
  justify-content: flex-start;
}

.msg-inner {
  max-width: min(100%, 340px);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
}

.msg.user .msg-inner {
  background: var(--bg-active);
  border-color: var(--border);
  border-bottom-right-radius: 3px;
}

.msg.assistant .msg-inner {
  background: var(--bg-elevated);
  border-bottom-left-radius: 3px;
}

.msg.thinking .msg-inner {
  opacity: 0.8;
}

.role {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 5px;
  color: var(--accent);
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
}

.msg.assistant .content {
  color: var(--text-muted);
}

.stream-caret {
  display: inline-block;
  width: 6px;
  height: 12px;
  margin-left: 2px;
  vertical-align: -1px;
  background: var(--accent);
  animation: stream-blink 1s step-end infinite;
}

@keyframes stream-blink {
  50% {
    opacity: 0;
  }
}

.composer {
  border-top: 1px solid var(--border-soft);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.err {
  margin: 0;
  font-size: 11px;
  color: #c45c5c;
}

.hint-warn {
  margin: 0;
  font-size: 11px;
  color: #c4a035;
  line-height: 1.4;
}

.composer-box {
  min-height: 56px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-root);
  padding: 8px 10px;
  font-size: 12.5px;
  color: var(--text);
  resize: none;
  outline: none;
}

.composer-box:focus {
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
}

.composer-box:disabled {
  color: var(--text-dim);
}

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mode-select {
  flex: 1;
  min-width: 0;
}

.hint {
  font-size: 10px;
  color: var(--text-dim);
}

.send {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: #06140e;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

:global([data-theme="light"]) .send {
  color: #ffffff;
}

.send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
