<script setup lang="ts">
/**
 * 待确认 / 已执行命令卡片。同意后走 Rust execute_approved_command，不直接写 PTY。
 */
import type { AgentCommand, RiskLevel } from "../types/ai";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n";

defineProps<{
  command: AgentCommand;
  busy?: boolean;
}>();

const emit = defineEmits<{
  approve: [];
  reject: [];
}>();

const { t } = useI18n();

const riskKey: Record<RiskLevel, MessageKey> = {
  low: "ai.risk.low",
  medium: "ai.risk.medium",
  high: "ai.risk.high",
};
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
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-root);
  padding: 8px;
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
  gap: 6px;
  margin-bottom: 6px;
}

.risk {
  font-size: 10px;
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
  font-size: 10px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
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

.cmd-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
}

.why {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

.reject,
.approve {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius);
  font-size: 11px;
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
  color: #06140e;
}

:global([data-theme="light"]) .approve {
  color: #ffffff;
}

.reject:disabled,
.approve:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
