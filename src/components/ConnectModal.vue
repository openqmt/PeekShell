<script setup lang="ts">
/**
 * 新增 / 编辑连接弹窗。
 * 密码与私钥口令只在保存时提交给后端，不进入 Pinia。
 */
import { open } from "@tauri-apps/plugin-dialog";
import { storeToRefs } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import { useHostsStore } from "../stores/hosts";
import { useUiStore } from "../stores/ui";
import type { AuthType, HostUpsert } from "../types/host";

const hosts = useHostsStore();
const ui = useUiStore();
const { editingHost, connectModalOpen } = storeToRefs(ui);

const saving = ref(false);
const error = ref("");

const form = reactive({
  name: "",
  group: "未分组",
  host: "",
  port: 22,
  note: "",
  username: "",
  authType: "password" as AuthType,
  password: "",
  privateKeyPath: "",
  passphrase: "",
});

const title = computed(() => (editingHost.value ? "编辑连接" : "新增连接"));
const passwordRequired = computed(
  () =>
    !editingHost.value ||
    editingHost.value.authType !== "password" ||
    !editingHost.value.hasSecret
);
const groupOptions = computed(() => {
  const set = new Set(hosts.groupNames);
  for (const host of hosts.hosts) set.add(host.group);
  set.add("未分组");
  if (form.group) set.add(form.group);
  return [...set].sort();
});

watch(
  connectModalOpen,
  (openModal) => {
    if (!openModal) return;
    error.value = "";
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
      form.group = "未分组";
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
    title: "选择私钥文件",
  });
  if (typeof selected === "string") {
    form.privateKeyPath = selected;
  }
}

async function save() {
  error.value = "";
  if (form.authType === "password" && passwordRequired.value && !form.password) {
    error.value = "请输入密码；当前连接没有已保存的密码。";
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
          <div class="sub">填写主机信息与认证方式</div>
        </div>
        <button type="button" class="icon-btn" aria-label="关闭" @click="ui.closeConnectModal()">✕</button>
      </div>
      <div class="modal-body">
        <div v-if="error" class="error-banner">{{ error }}</div>

        <div class="section-label">基本信息</div>
        <div class="form-grid">
          <div class="field">
            <label>名称<span class="req">*</span></label>
            <input v-model="form.name" type="text" placeholder="显示名称" />
          </div>
          <div class="field">
            <label>分组</label>
            <select v-model="form.group">
              <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
            </select>
          </div>
          <div class="field">
            <label>主机 IP<span class="req">*</span></label>
            <input v-model="form.host" type="text" placeholder="IP 或域名" />
          </div>
          <div class="field">
            <label>端口<span class="req">*</span></label>
            <input v-model.number="form.port" type="number" min="1" max="65535" />
          </div>
          <div class="field full">
            <label>备注</label>
            <textarea v-model="form.note" placeholder="可选，例如用途、注意事项" />
          </div>
        </div>

        <div class="section-label" style="margin-top: 16px">认证</div>
        <div class="auth-tabs">
          <button
            type="button"
            class="auth-tab"
            :class="{ active: form.authType === 'password' }"
            @click="form.authType = 'password'"
          >
            密码
          </button>
          <button
            type="button"
            class="auth-tab"
            :class="{ active: form.authType === 'privateKey' }"
            @click="form.authType = 'privateKey'"
          >
            公钥 / 私钥
          </button>
        </div>

        <div class="form-grid">
          <div class="field full">
            <label>用户名<span class="req">*</span></label>
            <input v-model="form.username" type="text" placeholder="如 root / ubuntu" />
          </div>
        </div>

        <div v-if="form.authType === 'password'" class="form-grid" style="margin-top: 12px">
          <div class="field full">
            <label>密码<span v-if="passwordRequired" class="req">*</span></label>
            <input
              v-model="form.password"
              type="password"
              :placeholder="passwordRequired ? '登录密码' : '留空则保持原密码'"
            />
          </div>
        </div>

        <div v-else class="form-grid" style="margin-top: 12px">
          <div class="field full">
            <label>私钥文件<span class="req">*</span></label>
            <div class="file-pick">
              <input v-model="form.privateKeyPath" type="text" readonly placeholder="选择私钥路径" />
              <button type="button" class="btn ghost md" @click="pickPrivateKey">加载私钥</button>
            </div>
          </div>
          <div class="field full">
            <label>私钥口令（可选）</label>
            <input
              v-model="form.passphrase"
              type="password"
              :placeholder="editingHost ? '留空则保持原口令' : '若私钥有 passphrase 请填写'"
            />
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn ghost md" @click="ui.closeConnectModal()">取消</button>
        <button type="button" class="btn primary md" :disabled="saving" @click="save">
          {{ saving ? "保存中…" : "保存" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-root);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
}

.auth-tab {
  flex: 1;
  height: 30px;
  border: none;
  border-radius: 6px;
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
  gap: 8px;
  align-items: center;
}

.file-pick input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
