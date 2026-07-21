<script setup lang="ts">
/** 主机列表：分组、连接、编辑、删除。 */
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import { useI18n } from "../i18n";
import { useHostsStore } from "../stores/hosts";
import { useSessionsStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";

const COLLAPSED_GROUPS_KEY = "peekshell.hosts.collapsedGroups";

function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((g): g is string => typeof g === "string")) : new Set();
  } catch {
    return new Set();
  }
}

const hosts = useHostsStore();
const sessions = useSessionsStore();
const ui = useUiStore();
const { t, groupLabel } = useI18n();
const { groups, error } = storeToRefs(hosts);
const localError = ref("");
const collapsedGroups = ref(readCollapsedGroups());
const connectingHostId = ref<string | null>(null);

function persistCollapsed() {
  localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...collapsedGroups.value]));
}

onMounted(() => {
  void hosts.refresh();
});

function isGroupCollapsed(group: string) {
  return collapsedGroups.value.has(group);
}

function toggleGroup(group: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(group)) next.delete(group);
  else next.add(group);
  collapsedGroups.value = next;
  persistCollapsed();
}

async function connect(hostId: string) {
  if (connectingHostId.value) return;
  localError.value = "";
  connectingHostId.value = hostId;
  try {
    await sessions.connect(hostId);
    ui.closeHostsModal();
  } catch (e) {
    localError.value = String(e);
  } finally {
    connectingHostId.value = null;
  }
}

async function removeHost(id: string, name: string) {
  if (!confirm(t("hosts.deleteHostConfirm", { name }))) return;
  await hosts.remove(id);
}

async function createGroup() {
  const name = prompt(t("hosts.newGroupPrompt"));
  if (!name?.trim()) return;
  localError.value = "";
  try {
    await hosts.createGroup(name.trim());
  } catch (e) {
    localError.value = String(e);
  }
}

async function renameGroup(from: string) {
  const to = prompt(t("hosts.renameGroupPrompt"), from);
  if (!to || to.trim() === from) return;
  const next = to.trim();
  await hosts.renameGroup(from, next);
  if (collapsedGroups.value.has(from)) {
    const updated = new Set(collapsedGroups.value);
    updated.delete(from);
    updated.add(next);
    collapsedGroups.value = updated;
    persistCollapsed();
  }
}

async function removeGroup(group: string) {
  if (!confirm(t("hosts.deleteGroupConfirm", { name: groupLabel(group) }))) return;
  await hosts.removeGroup(group);
  if (!collapsedGroups.value.has(group)) return;
  const updated = new Set(collapsedGroups.value);
  updated.delete(group);
  collapsedGroups.value = updated;
  persistCollapsed();
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
          <h2 id="hostsTitle">{{ t("hosts.title") }}</h2>
          <div class="sub">{{ t("hosts.sub") }}</div>
        </div>
        <div class="modal-tools">
          <button type="button" class="btn primary md" @click="ui.openConnectModal(null)">{{ t("hosts.addConnection") }}</button>
          <button type="button" class="btn ghost md" @click="createGroup">{{ t("hosts.addGroup") }}</button>
          <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="ui.closeHostsModal()">✕</button>
        </div>
      </div>
      <div class="modal-body">
        <div v-if="error || localError" class="error-banner">{{ localError || error }}</div>

        <div
          v-for="[group, list] in groups"
          :key="group"
          class="mgr-group"
          :class="{ collapsed: isGroupCollapsed(group) }"
        >
          <div
            class="mgr-group-head"
            role="button"
            tabindex="0"
            :aria-expanded="!isGroupCollapsed(group)"
            :title="isGroupCollapsed(group) ? t('hosts.expandGroup') : t('hosts.collapseGroup')"
            @click="toggleGroup(group)"
            @keydown.enter.prevent="toggleGroup(group)"
            @keydown.space.prevent="toggleGroup(group)"
          >
            <span class="chev" aria-hidden="true">▾</span>
            <span>{{ groupLabel(group) }}</span>
            <span class="count">{{ list.length }}</span>
            <button type="button" class="btn ghost mini" @click.stop="renameGroup(group)">{{ t("hosts.rename") }}</button>
            <button type="button" class="btn danger mini" @click.stop="removeGroup(group)">{{ t("hosts.deleteGroup") }}</button>
          </div>
          <template v-if="!isGroupCollapsed(group)">
            <div v-for="host in list" :key="host.id" class="mgr-row">
              <span class="status" :class="{ on: false }" />
              <div class="meta">
                <strong>{{ host.name }}</strong>
                <span>
                  {{ host.username }}@{{ host.host }}:{{ host.port }} ·
                  {{ host.authType === "password" ? t("hosts.authPassword") : t("hosts.authKey") }}
                </span>
                <span v-if="host.note" class="note">{{ host.note }}</span>
              </div>
              <div class="row-actions">
                <button type="button" class="btn primary mini" :disabled="!!connectingHostId" @click="ui.openConnectModal(host)">{{ t("common.edit") }}</button>
                <button
                  type="button"
                  class="btn ghost mini"
                  :disabled="!!connectingHostId"
                  @click="connect(host.id)"
                >
                  {{ connectingHostId === host.id ? t("common.connecting") : t("common.connect") }}
                </button>
                <button type="button" class="btn danger mini" :disabled="!!connectingHostId" @click="removeHost(host.id, host.name)">{{ t("common.delete") }}</button>
              </div>
            </div>
          </template>
        </div>

        <div v-if="!groups.length" class="empty">{{ t("hosts.empty") }}</div>
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
  cursor: pointer;
  user-select: none;
}

.mgr-group.collapsed .mgr-group-head {
  border-bottom: none;
}

.mgr-group-head .chev {
  display: inline-flex;
  width: 12px;
  color: var(--text-dim);
  transition: transform 0.15s ease;
}

.mgr-group.collapsed .mgr-group-head .chev {
  transform: rotate(-90deg);
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
