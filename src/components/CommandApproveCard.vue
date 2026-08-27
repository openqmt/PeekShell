<script setup lang="ts">
/**
 * 待确认 / 已执行命令卡片。同意后走 Rust execute_approved_command，不直接写 PTY。
 */
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ref } from "vue";
import type { AgentCommand, RiskLevel } from "../types/ai";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n";

const props = defineProps<{
  command: AgentCommand;
  busy?: boolean;
}>();

const emit = defineEmits<{
  approve: [];
  reject: [];
}>();

const { t } = useI18n();
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const riskKey: Record<RiskLevel, MessageKey> = {
  low: "ai.risk.low",
  medium: "ai.risk.medium",
  high: "ai.risk.high",
};

async function copyCommand() {
  try {
    await writeText(props.command.command);
  } catch {
    try {
      await navigator.clipboard.writeText(props.command.command);
    } catch {
      return;
    }
  }
  copied.value = true;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copied.value = false;
    copiedTimer = null;
  }, 1200);
}
</script>

<template>
  <div class="cmd-card" :data-risk="command.risk" :data-status="command.status">
    <div class="cmd-meta">
      <span class="risk">{{ t(riskKey[command.risk]) }}</span>
      <span v-if="command.autoExecuted" class="badge">{{ t("ai.autoRan") }}</span>
      <span v-else-if="command.status === 'suggested'" class="badge">{{ t("ai.suggested") }}</span>
      <span v-else-if="command.status === 'pendingConfirm'" class="badge wait">{{
        t("ai.awaiting")
      }}</span>
      <span v-else-if="command.status === 'executed'" class="badge ok">{{ t("ai.ran") }}</span>
      <span v-else-if="command.status === 'rejected'" class="badge">{{ t("ai.rejected") }}</span>
      <span v-else-if="command.status === 'failed'" class="badge err">{{ t("ai.failed") }}</span>
      <button
        type="button"
        class="copy-btn"
        :title="copied ? t('ai.copied') : t('ai.copy')"
        :aria-label="copied ? t('ai.copied') : t('ai.copy')"
        @click="copyCommand"
      >
        <svg v-if="!copied" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <rect
            x="5.5"
            y="5.5"
            width="7"
            height="7"
            rx="1.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
          />
          <path
            d="M3.5 10.5V3.5h7"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path
            d="M3.5 8.2 6.4 11l6.1-6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
    <pre class="cmd-text">{{ command.command }}</pre>
    <p v-if="command.rationale" class="why">{{ command.rationale }}</p>
    <p v-if="command.status === 'suggested'" class="why">{{ t("ai.suggestedHint") }}</p>
    <div v-if="command.status === 'pendingConfirm'" class="actions">
      <button class="reject" type="button" :disabled="busy" @click="emit('reject')">
        {{ t("ai.reject") }}
      </button>
      <button class="approve" type="button" :disabled="busy" @click="emit('approve')">
        {{ t("ai.approve") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.cmd-card {
  margin-top: calc(8px * var(--ui-scale, 1));
  border: 1px solid var(--border);
  border-radius: calc(6px * var(--ui-scale, 1));
  background: var(--bg-root);
  padding: calc(8px * var(--ui-scale, 1));
}

.cmd-card[data-risk="medium"] {
  border-color: #c4a035;
}

.cmd-card[data-risk="high"] {
  border-color: #c45c5c;
}

.cmd-meta {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--ui-scale, 1));
  margin-bottom: calc(6px * var(--ui-scale, 1));
}

.risk {
  font-size: calc(10px * var(--ui-scale, 1));
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent);
}

.cmd-card[data-risk="medium"] .risk {
  color: #c4a035;
}

.cmd-card[data-risk="high"] .risk {
  color: #c45c5c;
}

.badge {
  font-size: calc(10px * var(--ui-scale, 1));
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: calc(3px * var(--ui-scale, 1));
  padding: 1px calc(5px * var(--ui-scale, 1));
}

.badge.wait {
  color: #c4a035;
  border-color: #c4a03555;
}

.badge.ok {
  color: var(--accent);
}

.badge.err {
  color: #c45c5c;
}

.copy-btn {
  margin-left: auto;
  width: calc(24px * var(--ui-scale, 1));
  height: calc(24px * var(--ui-scale, 1));
  border: none;
  border-radius: calc(4px * var(--ui-scale, 1));
  background: transparent;
  color: var(--text-dim);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.copy-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.cmd-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: calc(12px * var(--ui-scale, 1));
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
}

.why {
  margin: calc(6px * var(--ui-scale, 1)) 0 0;
  font-size: calc(11px * var(--ui-scale, 1));
  color: var(--text-muted);
  line-height: 1.4;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(6px * var(--ui-scale, 1));
  margin-top: calc(8px * var(--ui-scale, 1));
}

.reject,
.approve {
  height: calc(26px * var(--ui-scale, 1));
  padding: 0 calc(10px * var(--ui-scale, 1));
  border-radius: var(--radius);
  font-size: calc(11px * var(--ui-scale, 1));
  font-weight: 600;
}

.reject {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
}

.approve {
  border: none;
  background: var(--accent);
  color: #ffffff;
}

.reject:disabled,
.approve:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
