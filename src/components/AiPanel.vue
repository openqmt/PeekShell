<script setup lang="ts">
/**
 * AI 助手面板（MVP 占位）：交互壳已就绪，Agent 闭环在 Phase 2 接入。
 */
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useI18n } from "../i18n";
import { useAiStore } from "../stores/ai";
import { useUiStore } from "../stores/ui";

const ai = useAiStore();
const ui = useUiStore();
const { t } = useI18n();
const { aiCollapsed } = storeToRefs(ui);
const { activeProvider } = storeToRefs(ai);
const draft = ref("");
const modelLabel = computed(() => activeProvider.value?.model ?? t("ai.notConfigured"));
</script>

<template>
  <aside class="ai-panel">
    <div v-if="!aiCollapsed" class="ai-head">
      <div class="ai-head-left">
        <h2>{{ t("ai.title") }}</h2>
      </div>
      <div class="ai-head-right">
        <span class="model-tag" :title="activeProvider?.name">{{ modelLabel }}</span>
        <div class="ai-head-actions">
          <button class="icon-btn" type="button" :title="t('ai.configure')" @click="ui.openAiSettingsModal()">⚙</button>
          <button class="icon-btn" type="button" :title="t('ai.collapse')" @click="aiCollapsed = true">»</button>
        </div>
      </div>
    </div>

    <div v-if="aiCollapsed" class="ai-rail">
      <button class="icon-btn" type="button" :title="t('ai.expand')" @click="aiCollapsed = false">«</button>
      <span class="rail-dot" />
      <span class="rail-ai-label">AI</span>
    </div>

    <div v-else class="ai-body">
      <div class="chat">
        <div class="msg assistant">
          <div class="role">PeekShell Agent</div>
          <div>
            <template v-if="activeProvider">
              {{ t("ai.ready", { name: activeProvider.name, model: activeProvider.model }) }}
            </template>
            <template v-else>
              {{ t("ai.setup") }}
            </template>
          </div>
        </div>
      </div>
      <div class="composer">
        <textarea v-model="draft" class="composer-box" rows="3" :placeholder="t('ai.placeholder')" disabled />
        <div class="composer-bar">
          <span class="hint">{{ t("ai.context") }}</span>
          <button class="send" type="button" disabled>{{ t("ai.send") }}</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ai-panel {
  background: var(--bg-panel);
  border-left: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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

.ai-head-left, .ai-head-right { display: flex; align-items: center; gap: 6px; }

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
  max-width: 120px;
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
  padding: 8px 10px;
}

.msg.assistant { color: var(--text-muted); font-size: 12.5px; line-height: 1.5; }
.role {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 4px;
}

.composer {
  border-top: 1px solid var(--border-soft);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
}

.composer-box:disabled { color: var(--text-dim); }

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hint { font-size: 10px; color: var(--text-dim); }

.send {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: #06140e;
  font-size: 12px;
  font-weight: 600;
}

:global([data-theme="light"]) .send {
  color: #ffffff;
}

.send:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
