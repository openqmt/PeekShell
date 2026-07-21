<script setup lang="ts">
/** 主机列表：分组、连接、编辑、删除。 */
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import { useHostsStore } from "../stores/hosts";
import { useSessionsStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";

const hosts = useHostsStore();
const sessions = useSessionsStore();
const ui = useUiStore();
const { groups, error } = storeToRefs(hosts);
const localError = ref("");

onMounted(() => {
  void hosts.refresh();
});

async function connect(hostId: string) {
  localError.value = "";
  try {
    await sessions.connect(hostId);
    ui.closeHostsModal();
  } catch (e) {
    localError.value = String(e);
  }
}

async function removeHost(id: string, name: string) {
  if (!confirm(`确定删除主机「${name}」？`)) return;
  await hosts.remove(id);
}

async function createGroup() {
  const name = prompt("新分组名称");
  if (!name?.trim()) return;
  localError.value = "";
  try {
    await hosts.createGroup(name.trim());
  } catch (e) {
    localError.value = String(e);
  }
}

async function renameGroup(from: string) {
  const to = prompt("新的分组名称", from);
  if (!to || to.trim() === from) return;
  await hosts.renameGroup(from, to.trim());
}

async function removeGroup(group: string) {
  if (!confirm(`删除分组「${group}」？组内主机将移到「未分组」。`)) return;
  await hosts.removeGroup(group);
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) ui.closeHostsModal();
}
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal" role="dialog" aria-labelledby="hostsTitle">
      <div class="modal-head">
        <div>
          <h2 id="hostsTitle">主机列表</h2>
          <div class="sub">支持分组、新增、编辑、删除</div>
        </div>
        <div class="modal-tools">
          <button type="button" class="btn primary md" @click="ui.openConnectModal(null)">＋ 新增连接</button>
          <button type="button" class="btn ghost md" @click="createGroup">＋ 新建分组</button>
          <button type="button" class="icon-btn" aria-label="关闭" @click="ui.closeHostsModal()">✕</button>
        </div>
      </div>
      <div class="modal-body">
        <div v-if="error || localError" class="error-banner">{{ localError || error }}</div>

        <div v-for="[group, list] in groups" :key="group" class="mgr-group">
          <div class="mgr-group-head">
            <span>▾</span>
            <span>{{ group }}</span>
            <span class="count">{{ list.length }}</span>
            <button type="button" class="btn ghost mini" @click="renameGroup(group)">重命名</button>
            <button type="button" class="btn danger mini" @click="removeGroup(group)">删除组</button>
          </div>
          <div v-for="host in list" :key="host.id" class="mgr-row">
            <span class="status" :class="{ on: false }" />
            <div class="meta">
              <strong>{{ host.name }}</strong>
              <span>
                {{ host.username }}@{{ host.host }}:{{ host.port }} ·
                {{ host.authType === "password" ? "密码" : "公钥" }}
              </span>
              <span v-if="host.note" class="note">{{ host.note }}</span>
            </div>
            <div class="row-actions">
              <button type="button" class="btn primary mini" @click="ui.openConnectModal(host)">编辑</button>
              <button type="button" class="btn ghost mini" @click="connect(host.id)">连接</button>
              <button type="button" class="btn danger mini" @click="removeHost(host.id, host.name)">删除</button>
            </div>
          </div>
        </div>

        <div v-if="!groups.length" class="empty">暂无主机或分组，可从右上角开始创建。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mgr-group {
  margin-bottom: 12px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-elevated);
}

.mgr-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-soft);
  font-size: 12px;
  font-weight: 600;
}

.count {
  margin-left: auto;
  font-weight: 400;
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.mgr-row {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid var(--border-soft);
  font-size: 12.5px;
}

.mgr-row:first-of-type { border-top: none; }
.mgr-row:hover { background: var(--bg-hover); }

.status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
}
.status.on { background: var(--accent); }

.meta strong { display: block; font-size: 13px; }
.meta span {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.note {
  display: block;
  margin-top: 2px;
  font-family: var(--font-ui) !important;
  color: var(--text-dim) !important;
}

.row-actions { display: flex; gap: 4px; }
.empty { color: var(--text-muted); font-size: 13px; padding: 24px; text-align: center; }
</style>
