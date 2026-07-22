<script setup lang="ts">
/**
 * 终端快捷命令：分组浏览、一键执行、增删改复制。
 */
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useI18n, UNGROUPED_GROUP } from "../i18n";
import { useQuickCommandsStore } from "../stores/quickCommands";
import { useSessionsStore } from "../stores/sessions";
import type { QuickCommand } from "../types/quickCommand";
import AppSelect from "./AppSelect.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [boolean] }>();

const { t, groupLabel } = useI18n();
const sessions = useSessionsStore();
const store = useQuickCommandsStore();
const { grouped, groups } = storeToRefs(store);
const { activeSessionId } = storeToRefs(sessions);

const panelEl = ref<HTMLElement | null>(null);
const collapsed = ref<Record<string, boolean>>({});
const editing = ref<QuickCommand | null>(null);
const creating = ref(false);
const formName = ref("");
const formCommand = ref("");
const formGroup = ref(UNGROUPED_GROUP);
const formError = ref("");
const statusMsg = ref("");
const groupPrompt = ref<"create" | "rename" | null>(null);
const groupPromptFrom = ref("");
const groupPromptInput = ref("");
const groupPromptEl = ref<HTMLInputElement | null>(null);

const groupOptions = computed(() =>
  groups.value.map((g) => ({ value: g, label: groupLabel(g) }))
);

const canRun = computed(() => !!activeSessionId.value);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      creating.value = false;
      editing.value = null;
      groupPrompt.value = null;
      formError.value = "";
      statusMsg.value = "";
    }
  }
);

function close() {
  emit("update:open", false);
}

function isGroupOpen(group: string) {
  return !collapsed.value[group];
}

function toggleGroup(group: string) {
  collapsed.value = { ...collapsed.value, [group]: !collapsed.value[group] };
}

function startCreate() {
  editing.value = null;
  creating.value = true;
  formName.value = "";
  formCommand.value = "";
  formGroup.value = UNGROUPED_GROUP;
  formError.value = "";
}

function startEdit(cmd: QuickCommand) {
  creating.value = false;
  editing.value = cmd;
  formName.value = cmd.name;
  formCommand.value = cmd.command;
  formGroup.value = cmd.group;
  formError.value = "";
}

function cancelForm() {
  creating.value = false;
  editing.value = null;
  formError.value = "";
}

function saveForm() {
  formError.value = "";
  try {
    store.upsert({
      id: editing.value?.id,
      name: formName.value,
      command: formCommand.value,
      group: formGroup.value,
    });
    cancelForm();
    statusMsg.value = t("quickCommands.saved");
  } catch {
    formError.value = t("quickCommands.formInvalid");
  }
}

async function runCommand(cmd: QuickCommand) {
  if (!activeSessionId.value) {
    statusMsg.value = t("quickCommands.needSession");
    return;
  }
  const raw = cmd.command.replace(/\r\n/g, "\n").replace(/\n/g, "\r");
  const payload = raw.endsWith("\r") ? raw : `${raw}\r`;
  try {
    await sessions.write(payload);
    statusMsg.value = t("quickCommands.ran", { name: cmd.name });
    close();
  } catch (e) {
    statusMsg.value = String(e);
  }
}

async function copyCommand(cmd: QuickCommand) {
  try {
    await writeText(cmd.command);
  } catch {
    try {
      await navigator.clipboard.writeText(cmd.command);
    } catch {
      statusMsg.value = t("quickCommands.copyFailed");
      return;
    }
  }
  statusMsg.value = t("quickCommands.copied");
}

function deleteCommand(cmd: QuickCommand) {
  store.remove(cmd.id);
  if (editing.value?.id === cmd.id) cancelForm();
  statusMsg.value = t("quickCommands.deleted");
}

function openCreateGroup() {
  groupPrompt.value = "create";
  groupPromptFrom.value = "";
  groupPromptInput.value = "";
  void nextTick(() => groupPromptEl.value?.focus());
}

function openRenameGroup(group: string) {
  if (group === UNGROUPED_GROUP) return;
  groupPrompt.value = "rename";
  groupPromptFrom.value = group;
  groupPromptInput.value = group;
  void nextTick(() => {
    groupPromptEl.value?.focus();
    groupPromptEl.value?.select();
  });
}

function submitGroupPrompt() {
  const name = groupPromptInput.value.trim();
  if (!name || !groupPrompt.value) return;
  if (groupPrompt.value === "create") {
    store.addGroup(name);
    formGroup.value = store.ensureGroup(name);
  } else {
    store.renameGroup(groupPromptFrom.value, name);
  }
  groupPrompt.value = null;
  groupPromptInput.value = "";
}

function deleteGroup(group: string) {
  if (group === UNGROUPED_GROUP) return;
  store.removeGroup(group);
  if (formGroup.value === group) formGroup.value = UNGROUPED_GROUP;
}

function onDocPointerDown(event: PointerEvent) {
  if (!props.open) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest?.(".quick-commands-panel") || target?.closest?.(".quick-commands-btn")) {
    return;
  }
  close();
}

onMounted(() => {
  window.addEventListener("pointerdown", onDocPointerDown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onDocPointerDown, true);
});
</script>

<template>
  <div v-if="open" ref="panelEl" class="quick-commands-panel" @mousedown.stop>
    <div class="qc-head">
      <div>
        <strong>{{ t("quickCommands.title") }}</strong>
        <div class="qc-sub">{{ t("quickCommands.sub") }}</div>
      </div>
      <div class="qc-head-actions">
        <button type="button" class="btn ghost mini" @click="openCreateGroup">
          {{ t("quickCommands.addGroup") }}
        </button>
        <button type="button" class="btn primary mini" @click="startCreate">
          {{ t("quickCommands.add") }}
        </button>
        <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="close">
          ✕
        </button>
      </div>
    </div>

    <div v-if="statusMsg" class="qc-status">{{ statusMsg }}</div>
    <div v-if="!canRun" class="qc-hint">{{ t("quickCommands.needSession") }}</div>

    <div v-if="creating || editing" class="qc-form">
      <div class="qc-form-title">
        {{ editing ? t("quickCommands.edit") : t("quickCommands.add") }}
      </div>
      <div v-if="formError" class="qc-error">{{ formError }}</div>
      <div class="field">
        <label>{{ t("quickCommands.name") }}</label>
        <input v-model="formName" type="text" :placeholder="t('quickCommands.namePlaceholder')" />
      </div>
      <div class="field">
        <label>{{ t("quickCommands.group") }}</label>
        <AppSelect v-model="formGroup" :options="groupOptions" />
      </div>
      <div class="field">
        <label>{{ t("quickCommands.command") }}</label>
        <textarea
          v-model="formCommand"
          rows="3"
          :placeholder="t('quickCommands.commandPlaceholder')"
        />
      </div>
      <div class="qc-form-actions">
        <button type="button" class="btn ghost" @click="cancelForm">{{ t("common.cancel") }}</button>
        <button type="button" class="btn primary" @click="saveForm">{{ t("common.save") }}</button>
      </div>
    </div>

    <div class="qc-body">
      <div v-if="!grouped.length" class="qc-empty">{{ t("quickCommands.empty") }}</div>
      <div v-for="[group, list] in grouped" :key="group" class="qc-group" :class="{ open: isGroupOpen(group) }">
        <div
          class="qc-group-head"
          role="button"
          tabindex="0"
          @click="toggleGroup(group)"
          @keydown.enter.prevent="toggleGroup(group)"
        >
          <span class="chev" :class="{ open: isGroupOpen(group) }">›</span>
          <span class="qc-group-name">{{ groupLabel(group) }}</span>
          <span class="qc-count">{{ list.length }}</span>
          <div class="qc-group-actions" @click.stop>
            <button
              v-if="group !== UNGROUPED_GROUP"
              type="button"
              class="btn ghost mini"
              @click="openRenameGroup(group)"
            >
              {{ t("quickCommands.renameGroup") }}
            </button>
            <button
              v-if="group !== UNGROUPED_GROUP"
              type="button"
              class="btn danger mini"
              @click="deleteGroup(group)"
            >
              {{ t("quickCommands.deleteGroup") }}
            </button>
          </div>
        </div>
        <div v-show="isGroupOpen(group)" class="qc-list">
          <div v-if="!list.length" class="qc-empty-group">{{ t("quickCommands.emptyGroup") }}</div>
          <div v-for="cmd in list" :key="cmd.id" class="qc-item">
            <button
              type="button"
              class="qc-run"
              :disabled="!canRun"
              :title="cmd.command"
              @click="runCommand(cmd)"
            >
              <strong>{{ cmd.name }}</strong>
              <span>{{ cmd.command }}</span>
            </button>
            <div class="qc-item-actions">
              <button
                type="button"
                class="qc-icon-btn"
                :title="t('quickCommands.copy')"
                :aria-label="t('quickCommands.copy')"
                @click="copyCommand(cmd)"
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
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
              </button>
              <button
                type="button"
                class="qc-icon-btn"
                :title="t('common.edit')"
                :aria-label="t('common.edit')"
                @click="startEdit(cmd)"
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <path
                    d="M9.2 3.6 12.4 6.8M3.5 12.5l1.1-3.9L11.2 2l3.1 3.1-6.6 6.6-3.9 1.1z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="qc-icon-btn danger"
                :title="t('common.delete')"
                :aria-label="t('common.delete')"
                @click="deleteCommand(cmd)"
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
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
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="groupPrompt" class="qc-prompt" @click.self="groupPrompt = null">
      <div class="qc-prompt-box">
        <h3>
          {{
            groupPrompt === "create"
              ? t("quickCommands.addGroup")
              : t("quickCommands.renameGroup")
          }}
        </h3>
        <div class="field">
          <label>{{ t("quickCommands.groupName") }}</label>
          <input
            ref="groupPromptEl"
            v-model="groupPromptInput"
            type="text"
            @keydown.enter.prevent="submitGroupPrompt"
            @keydown.esc.prevent="groupPrompt = null"
          />
        </div>
        <div class="qc-form-actions">
          <button type="button" class="btn ghost" @click="groupPrompt = null">
            {{ t("common.cancel") }}
          </button>
          <button
            type="button"
            class="btn primary"
            :disabled="!groupPromptInput.trim()"
            @click="submitGroupPrompt"
          >
            {{ t("common.save") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quick-commands-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 8px;
  width: min(420px, calc(100vw - 24px));
  height: min(420px, calc(100vh - 120px));
  max-height: min(520px, calc(100vh - 120px));
  z-index: 40;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.qc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--border-soft);
}

.qc-head strong {
  font-size: 13px;
  font-weight: 600;
}

.qc-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
}

.qc-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.qc-status,
.qc-hint {
  padding: 6px 10px;
  font-size: 11px;
  border-bottom: 1px solid var(--border-soft);
}

.qc-status {
  color: var(--accent);
  background: var(--accent-dim);
}

.qc-hint {
  color: var(--warn);
  background: var(--warn-dim);
}

.qc-form {
  padding: 10px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qc-form-title {
  font-size: 12px;
  font-weight: 600;
}

.qc-error {
  font-size: 11px;
  color: var(--danger);
}

.qc-form .field label {
  margin-bottom: 4px;
}

.qc-form .field input,
.qc-form .field textarea {
  height: auto;
  min-height: 28px;
  font-size: 12.5px;
}

.qc-form .field textarea {
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-root);
  color: var(--text);
  font-family: var(--font-mono);
  resize: vertical;
}

.qc-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.qc-body {
  flex: 1;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.qc-empty,
.qc-empty-group {
  padding: 16px 8px;
  text-align: center;
  color: var(--text-dim);
  font-size: 12px;
}

.qc-group {
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-elevated);
}

.qc-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg-hover);
  cursor: pointer;
  user-select: none;
}

.chev {
  width: 14px;
  text-align: center;
  color: var(--text-dim);
  transition: transform 0.15s ease;
}

.chev.open {
  transform: rotate(90deg);
}

.qc-group-name {
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-count {
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  background: var(--bg-root);
  border: 1px solid var(--border-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.qc-group-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.qc-list {
  display: flex;
  flex-direction: column;
}

.qc-item {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: 4px 6px;
  border-top: 1px solid var(--border-soft);
}

.qc-run {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 4px;
  padding: 6px 8px;
  color: var(--text);
  cursor: pointer;
}

.qc-run:hover:not(:disabled) {
  background: var(--bg-hover);
}

.qc-run:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.qc-run strong {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
}

.qc-run span {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-item-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding-right: 2px;
}

.qc-icon-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  display: grid;
  place-items: center;
}

.qc-icon-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.qc-icon-btn.danger:hover {
  color: var(--danger);
  background: var(--danger-dim);
}

.qc-prompt {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--overlay);
}

.qc-prompt-box {
  width: min(320px, 100%);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qc-prompt-box h3 {
  font-size: 13px;
  font-weight: 600;
}
</style>
