<script setup lang="ts">
/**
 * AI 助手面板（MVP 占位）：交互壳已就绪，Agent 闭环在 Phase 2 接入。
 */
import { storeToRefs } from "pinia";
import { ref } from "vue";
import { useUiStore } from "../stores/ui";

const ui = useUiStore();
const { aiCollapsed } = storeToRefs(ui);
const draft = ref("");
</script>

<template>
  <aside class="ai-panel">
    <div v-if="!aiCollapsed" class="ai-head">
      <div class="ai-head-left">
        <h2>AI Assist</h2>
      </div>
      <div class="ai-head-right">
        <span class="model-tag">soon</span>
        <button class="icon-btn" type="button" title="折叠 AI 助手" @click="aiCollapsed = true">»</button>
      </div>
    </div>

    <div v-if="aiCollapsed" class="ai-rail">
      <button class="icon-btn" type="button" title="展开 AI 助手" @click="aiCollapsed = false">«</button>
      <span class="rail-dot" />
      <span class="rail-ai-label">AI</span>
    </div>

    <div v-else class="ai-body">
      <div class="chat">
        <div class="msg assistant">
          <div class="role">PeekShell Agent</div>
          <div>
            AI Agent 将在 Phase 2 接入：根据终端上下文提议命令，经你确认后再执行。
            当前可先完成 SSH 连接与主机管理。
          </div>
        </div>
      </div>
      <div class="composer">
        <textarea v-model="draft" class="composer-box" rows="3" placeholder="Phase 2：在此提问，例如「检查 nginx 错误日志」" disabled />
        <div class="composer-bar">
          <span class="hint">上下文：最近终端输出 · 当前主机</span>
          <button class="send" type="button" disabled>发送</button>
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
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-head-left, .ai-head-right { display: flex; align-items: center; gap: 8px; }

.ai-head h2 {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
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
  padding: 8px 0 12px;
  gap: 12px;
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
  padding: 14px;
}

.msg.assistant { color: var(--text-muted); font-size: 12.5px; line-height: 1.55; }
.role {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 6px;
}

.composer {
  border-top: 1px solid var(--border-soft);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.composer-box {
  min-height: 72px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-root);
  padding: 10px 12px;
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
  padding: 0 14px;
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
