<script setup lang="ts">
/**
 * 新增 / 编辑连接弹窗。
 * 密码与私钥口令只在保存时提交给后端，不进入 Pinia。
 */
import { open } from "@tauri-apps/plugin-dialog";
import { storeToRefs } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import * as api from "../api/tauri";
import { useI18n, UNGROUPED_GROUP } from "../i18n";
import { useHostsStore } from "../stores/hosts";
import { useUiStore } from "../stores/ui";
import type { AuthType, HostUpsert } from "../types/host";
import AppSelect from "./AppSelect.vue";

const hosts = useHostsStore();
const ui = useUiStore();
const { t, groupLabel } = useI18n();
const { editingHost, connectModalOpen } = storeToRefs(ui);

const saving = ref(false);
const testing = ref(false);
const error = ref("");
const testOk = ref("");

const form = reactive({
  name: "",
  group: UNGROUPED_GROUP,
  host: "",
  port: 22,
  note: "",
  username: "",
  authType: "password" as AuthType,
  password: "",
  privateKeyPath: "",
  passphrase: "",
});

const title = computed(() =>
  editingHost.value ? t("connect.editTitle") : t("connect.addTitle")
);
const passwordRequired = computed(
  () =>
    !editingHost.value ||
    editingHost.value.authType !== "password" ||
    !editingHost.value.hasSecret
);
const groupOptions = computed(() => {
  const set = new Set(hosts.groupNames);
  for (const host of hosts.hosts) set.add(host.group);
  set.add(UNGROUPED_GROUP);
  if (form.group) set.add(form.group);
  return [...set]
    .sort()
    .map((g) => ({ value: g, label: groupLabel(g) }));
});

watch(
  connectModalOpen,
  (openModal) => {
    if (!openModal) return;
    error.value = "";
    testOk.value = "";
    const h = editingHost.value;
    if (h) {
      form.name = h.name;
      form.group = h.group;
      form.host = h.host;
      form.port = h.port;
      form.note = h.note;
      form.username = h.username;
      form.authType = h.authType;
      form.password = "";
      form.privateKeyPath = h.privateKeyPath ?? "";
      form.passphrase = "";
    } else {
      form.name = "";
      form.group = UNGROUPED_GROUP;
      form.host = "";
      form.port = 22;
      form.note = "";
      form.username = "";
      form.authType = "password";
      form.password = "";
      form.privateKeyPath = "";
      form.passphrase = "";
    }
  },
  { immediate: true }
);

async function pickPrivateKey() {
  const selected = await open({
    multiple: false,
    title: t("connect.pickKeyTitle"),
  });
  if (typeof selected === "string") {
    form.privateKeyPath = selected;
  }
}

function validateForTest(): string | null {
  if (!form.host.trim()) return t("connect.hostRequired");
  if (!form.port || form.port < 1 || form.port > 65535) return t("connect.portInvalid");
  if (!form.username.trim()) return t("connect.usernameRequired");
  if (form.authType === "password") {
    if (passwordRequired.value && !form.password) return t("connect.passwordRequired");
  } else if (!form.privateKeyPath.trim()) {
    return t("connect.keyRequired");
  }
  return null;
}

async function testConnection() {
  error.value = "";
  testOk.value = "";
  const validation = validateForTest();
  if (validation) {
    error.value = validation;
    return;
  }
  testing.value = true;
  try {
    await api.testHostConnection({
      host: form.host.trim(),
      port: Number(form.port),
      username: form.username.trim(),
      authType: form.authType,
      password: form.authType === "password" && form.password ? form.password : undefined,
      privateKeyPath: form.authType === "privateKey" ? form.privateKeyPath.trim() : undefined,
      passphrase: form.authType === "privateKey" && form.passphrase ? form.passphrase : undefined,
      hostId: editingHost.value?.id,
    });
    testOk.value = t("connect.testOk");
  } catch (e) {
    error.value = String(e);
  } finally {
    testing.value = false;
  }
}

async function save() {
  error.value = "";
  testOk.value = "";
  if (form.authType === "password" && passwordRequired.value && !form.password) {
    error.value = t("connect.passwordRequired");
    return;
  }
  saving.value = true;
  try {
    const payload: HostUpsert = {
      id: editingHost.value?.id,
      name: form.name,
      group: form.group,
      host: form.host,
      port: Number(form.port),
      note: form.note,
      username: form.username,
      authType: form.authType,
    };
    if (form.authType === "password") {
      if (form.password) payload.password = form.password;
    } else {
      payload.privateKeyPath = form.privateKeyPath;
      if (form.passphrase) payload.passphrase = form.passphrase;
    }
    await hosts.upsert(payload);
    ui.closeConnectModal();
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) ui.closeConnectModal();
}
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal sm" role="dialog" :aria-label="title">
      <div class="modal-head">
        <div>
          <h2>{{ title }}</h2>
          <div class="sub">{{ t("connect.sub") }}</div>
        </div>
        <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="ui.closeConnectModal()">✕</button>
      </div>
      <div class="modal-body">
        <div v-if="error" class="error-banner">{{ error }}</div>
        <div v-else-if="testOk" class="ok-banner">{{ testOk }}</div>

        <div class="section-label">{{ t("connect.basic") }}</div>
        <div class="form-grid">
          <div class="field">
            <label>{{ t("connect.name") }}<span class="req">*</span></label>
            <input v-model="form.name" type="text" :placeholder="t('connect.namePlaceholder')" />
          </div>
          <div class="field">
            <label>{{ t("connect.group") }}</label>
            <AppSelect v-model="form.group" :options="groupOptions" />
          </div>
          <div class="field">
            <label>{{ t("connect.host") }}<span class="req">*</span></label>
            <input v-model="form.host" type="text" :placeholder="t('connect.hostPlaceholder')" />
          </div>
          <div class="field">
            <label>{{ t("connect.port") }}<span class="req">*</span></label>
            <input v-model.number="form.port" type="number" min="1" max="65535" />
          </div>
          <div class="field full">
            <label>{{ t("connect.note") }}</label>
            <textarea v-model="form.note" :placeholder="t('connect.notePlaceholder')" />
          </div>
        </div>

        <div class="section-label auth-section">{{ t("connect.auth") }}</div>
        <div class="auth-tabs">
          <button
            type="button"
            class="auth-tab"
            :class="{ active: form.authType === 'password' }"
            @click="form.authType = 'password'"
          >
            {{ t("connect.password") }}
          </button>
          <button
            type="button"
            class="auth-tab"
            :class="{ active: form.authType === 'privateKey' }"
            @click="form.authType = 'privateKey'"
          >
            {{ t("connect.privateKey") }}
          </button>
        </div>

        <div class="form-grid">
          <div class="field full">
            <label>{{ t("connect.username") }}<span class="req">*</span></label>
            <input v-model="form.username" type="text" :placeholder="t('connect.usernamePlaceholder')" />
          </div>
        </div>

        <div v-if="form.authType === 'password'" class="form-grid auth-fields">
          <div class="field full">
            <label>{{ t("connect.password") }}<span v-if="passwordRequired" class="req">*</span></label>
            <input
              v-model="form.password"
              type="password"
              :placeholder="passwordRequired ? t('connect.passwordPlaceholder') : t('connect.passwordKeep')"
            />
          </div>
        </div>

        <div v-else class="form-grid auth-fields">
          <div class="field full">
            <label>{{ t("connect.keyFile") }}<span class="req">*</span></label>
            <div class="file-pick">
              <input v-model="form.privateKeyPath" type="text" readonly :placeholder="t('connect.keyPathPlaceholder')" />
              <button type="button" class="btn ghost md" @click="pickPrivateKey">{{ t("connect.loadKey") }}</button>
            </div>
          </div>
          <div class="field full">
            <label>{{ t("connect.passphrase") }}</label>
            <input
              v-model="form.passphrase"
              type="password"
              :placeholder="editingHost ? t('connect.passphraseKeep') : t('connect.passphrasePlaceholder')"
            />
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button
          type="button"
          class="btn ghost md"
          :disabled="testing || saving"
          @click="testConnection"
        >
          {{ testing ? t("connect.testing") : t("connect.test") }}
        </button>
        <span class="foot-spacer" />
        <button type="button" class="btn ghost md" @click="ui.closeConnectModal()">{{ t("common.cancel") }}</button>
        <button type="button" class="btn primary md" :disabled="saving || testing" @click="save">
          {{ saving ? t("common.saving") : t("common.save") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal.sm {
  width: min(460px, 100%);
  max-height: min(720px, calc(100vh - 48px));
}

.modal :deep(.modal-head) {
  padding: 10px 12px;
}

.modal :deep(.modal-head h2) {
  font-size: 14px;
}

.modal :deep(.modal-head .sub) {
  margin-top: 1px;
}

.modal :deep(.modal-body) {
  padding: 10px 12px;
}

.modal :deep(.modal-foot) {
  padding: 8px 12px;
  gap: 6px;
}

.modal :deep(.section-label) {
  margin: 0 0 6px;
}

.modal :deep(.form-grid) {
  gap: 8px;
}

.modal :deep(.field label) {
  margin-bottom: 4px;
  font-size: 11px;
}

.modal :deep(.field input),
.modal :deep(.field select),
.modal :deep(.field textarea) {
  height: 30px;
  padding: 0 8px;
  font-size: 12.5px;
}

.modal :deep(.app-select-trigger) {
  height: 30px;
  padding: 0 8px 0 10px;
  font-size: 12.5px;
}

.modal :deep(.field textarea) {
  height: 52px;
  padding: 6px 8px;
  resize: vertical;
}

.modal :deep(.error-banner) {
  margin-bottom: 8px;
  padding: 6px 8px;
}

.ok-banner {
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 12px;
}

.auth-section {
  margin-top: 10px !important;
}

.auth-fields {
  margin-top: 8px;
}

.auth-tabs {
  display: flex;
  gap: 3px;
  padding: 2px;
  background: var(--bg-root);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 8px;
}

.auth-tab {
  flex: 1;
  height: 28px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}

.auth-tab.active {
  background: var(--accent-dim);
  color: var(--accent);
  outline: 1px solid var(--accent-border);
}

.file-pick {
  display: flex;
  gap: 6px;
  align-items: center;
}

.file-pick input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12px;
}

.foot-spacer {
  flex: 1;
}
</style>
