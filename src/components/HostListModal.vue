<script setup lang="ts">
/** 主机列表：分组、连接、复制 SSH 命令、编辑、删除。 */
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as api from '../api/tauri'
import { useI18n } from '../i18n'
import { useHostsStore } from '../stores/hosts'
import { useSessionsStore } from '../stores/sessions'
import { useUiStore } from '../stores/ui'
import type { HostRecord } from '../types/host'

const COLLAPSED_GROUPS_KEY = 'peekshell.hosts.collapsedGroups'

type NameDialog = { mode: 'create' } | { mode: 'rename'; from: string }

type ConfirmDialog =
    | { kind: 'host'; id: string; name: string }
    | { kind: 'group'; group: string }

function readCollapsedGroups(): Set<string> {
    try {
        const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY)
        if (!raw) return new Set()
        const parsed = JSON.parse(raw) as unknown
        return Array.isArray(parsed)
            ? new Set(parsed.filter((g): g is string => typeof g === 'string'))
            : new Set()
    } catch {
        return new Set()
    }
}

const hosts = useHostsStore()
const sessions = useSessionsStore()
const ui = useUiStore()
const { t, groupLabel } = useI18n()
const { groups, error } = storeToRefs(hosts)
const localError = ref('')
const collapsedGroups = ref(readCollapsedGroups())
const connectingHostId = ref<string | null>(null)
const nameDialog = ref<NameDialog | null>(null)
const nameInput = ref('')
const nameInputEl = ref<HTMLInputElement | null>(null)
const nameSaving = ref(false)
const confirmDialog = ref<ConfirmDialog | null>(null)
const confirmBusy = ref(false)
const copiedHostId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const nameDialogTitle = computed(() =>
    nameDialog.value?.mode === 'rename'
        ? t('hosts.rename')
        : t('hosts.addGroup'),
)
const nameDialogLabel = computed(() =>
    nameDialog.value?.mode === 'rename'
        ? t('hosts.renameGroupPrompt')
        : t('hosts.newGroupPrompt'),
)
const confirmMessage = computed(() => {
    const dialog = confirmDialog.value
    if (!dialog) return ''
    if (dialog.kind === 'host')
        return t('hosts.deleteHostConfirm', { name: dialog.name })
    return t('hosts.deleteGroupConfirm', { name: groupLabel(dialog.group) })
})

function persistCollapsed() {
    localStorage.setItem(
        COLLAPSED_GROUPS_KEY,
        JSON.stringify([...collapsedGroups.value]),
    )
}

onMounted(() => {
    void hosts.refresh()
})

/** 最多保持一个分组展开（手风琴）。 */
watch(
    groups,
    (list) => {
        const open = list
            .map(([g]) => g)
            .filter((g) => !collapsedGroups.value.has(g))
        if (open.length <= 1) return
        const keep = open[0]
        collapsedGroups.value = new Set(
            list.map(([g]) => g).filter((g) => g !== keep),
        )
        persistCollapsed()
    },
    { immediate: true },
)

function isGroupOpen(group: string) {
    return !collapsedGroups.value.has(group)
}

/** 手风琴：展开当前分组时收起其他分组。 */
function toggleGroup(group: string) {
    const next = new Set(collapsedGroups.value)
    if (!next.has(group)) {
        next.add(group)
    } else {
        for (const [g] of groups.value) next.add(g)
        next.delete(group)
    }
    collapsedGroups.value = next
    persistCollapsed()
}

async function connect(hostId: string) {
    if (connectingHostId.value) return
    localError.value = ''
    connectingHostId.value = hostId
    try {
        await sessions.connect(hostId)
        ui.closeHostsModal()
    } catch (e) {
        localError.value = String(e)
    } finally {
        connectingHostId.value = null
    }
}

function openRemoveHost(id: string, name: string) {
    confirmDialog.value = { kind: 'host', id, name }
}

function openRemoveGroup(group: string) {
    confirmDialog.value = { kind: 'group', group }
}

function closeConfirmDialog() {
    if (confirmBusy.value) return
    confirmDialog.value = null
}

async function submitConfirmDialog() {
    const dialog = confirmDialog.value
    if (!dialog || confirmBusy.value) return

    confirmBusy.value = true
    localError.value = ''
    try {
        if (dialog.kind === 'host') {
            await hosts.remove(dialog.id)
        } else {
            await hosts.removeGroup(dialog.group)
            if (collapsedGroups.value.has(dialog.group)) {
                const updated = new Set(collapsedGroups.value)
                updated.delete(dialog.group)
                collapsedGroups.value = updated
                persistCollapsed()
            }
        }
        confirmDialog.value = null
    } catch (e) {
        localError.value = String(e)
    } finally {
        confirmBusy.value = false
    }
}

function openCreateGroup() {
    nameDialog.value = { mode: 'create' }
    nameInput.value = ''
    localError.value = ''
    void nextTick(() => {
        nameInputEl.value?.focus()
        nameInputEl.value?.select()
    })
}

function openRenameGroup(from: string) {
    nameDialog.value = { mode: 'rename', from }
    nameInput.value = from
    localError.value = ''
    void nextTick(() => {
        nameInputEl.value?.focus()
        nameInputEl.value?.select()
    })
}

function closeNameDialog() {
    if (nameSaving.value) return
    nameDialog.value = null
    nameInput.value = ''
}

async function submitNameDialog() {
    const dialog = nameDialog.value
    const name = nameInput.value.trim()
    if (!dialog || !name || nameSaving.value) return

    if (dialog.mode === 'rename' && name === dialog.from) {
        nameDialog.value = null
        nameInput.value = ''
        return
    }

    nameSaving.value = true
    localError.value = ''
    try {
        if (dialog.mode === 'create') {
            await hosts.createGroup(name)
        } else {
            await hosts.renameGroup(dialog.from, name)
            if (collapsedGroups.value.has(dialog.from)) {
                const updated = new Set(collapsedGroups.value)
                updated.delete(dialog.from)
                updated.add(name)
                collapsedGroups.value = updated
                persistCollapsed()
            }
        }
        nameDialog.value = null
        nameInput.value = ''
    } catch (e) {
        localError.value = String(e)
    } finally {
        nameSaving.value = false
    }
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
}

function sshDestination(username: string, host: string): string {
    const target =
        host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
    return `${username}@${target}`
}

/** sshpass one-liner so the password can be used from a local shell. */
function buildSshCommand(host: HostRecord, password: string | null): string {
    const dest = sshDestination(host.username, host.host)
    const portFlag = host.port && host.port !== 22 ? ` -p ${host.port}` : ''
    if (host.authType === 'privateKey' && host.privateKeyPath) {
        return `ssh -i ${shellQuote(host.privateKeyPath)}${portFlag} ${dest}`
    }
    const ssh = `ssh${portFlag} ${dest}`
    if (password) return `${ssh} -password ${shellQuote(password)}`
    return ssh
}

async function copyToClipboard(text: string) {
    try {
        await writeText(text)
    } catch {
        await navigator.clipboard.writeText(text)
    }
}

async function copySshCommand(host: HostRecord) {
    localError.value = ''
    try {
        let password: string | null = null
        if (host.authType === 'password' && host.hasSecret) {
            password = await api.getHostSecret(host.id, 'password')
        }
        await copyToClipboard(buildSshCommand(host, password))
        copiedHostId.value = host.id
        if (copiedTimer) clearTimeout(copiedTimer)
        copiedTimer = setTimeout(() => {
            if (copiedHostId.value === host.id) copiedHostId.value = null
            copiedTimer = null
        }, 1600)
    } catch (e) {
        localError.value = String(e)
    }
}

onBeforeUnmount(() => {
    if (copiedTimer) clearTimeout(copiedTimer)
})

function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) ui.closeHostsModal()
}
</script>

<template>
    <div class="overlay" @click="onBackdrop">
        <div
            class="modal hosts-modal"
            role="dialog"
            aria-labelledby="hostsTitle"
        >
            <div class="modal-head">
                <div>
                    <h2 id="hostsTitle">{{ t('hosts.title') }}</h2>
                    <div class="sub">{{ t('hosts.sub') }}</div>
                </div>
                <div class="modal-tools">
                    <button
                        type="button"
                        class="btn ghost"
                        @click="openCreateGroup"
                    >
                        {{ t('hosts.addGroup') }}
                    </button>
                    <button
                        type="button"
                        class="btn primary"
                        @click="ui.openConnectModal(null)"
                    >
                        {{ t('hosts.addConnection') }}
                    </button>
                    <button
                        type="button"
                        class="icon-btn"
                        :aria-label="t('common.close')"
                        @click="ui.closeHostsModal()"
                    >
                        ✕
                    </button>
                </div>
            </div>
            <div class="modal-body">
                <div v-if="error || localError" class="error-banner">
                    {{ localError || error }}
                </div>

                <div
                    v-for="([group, list], index) in groups"
                    :key="group"
                    class="mgr-group"
                    :class="{ open: isGroupOpen(group) }"
                >
                    <div
                        class="mgr-group-head"
                        role="button"
                        tabindex="0"
                        :aria-expanded="isGroupOpen(group)"
                        :aria-controls="`group-panel-${index}`"
                        :title="
                            isGroupOpen(group)
                                ? t('hosts.collapseGroup')
                                : t('hosts.expandGroup')
                        "
                        @click="toggleGroup(group)"
                        @keydown.enter.prevent="toggleGroup(group)"
                        @keydown.space.prevent="toggleGroup(group)"
                    >
                        <span class="chev" aria-hidden="true">
                            <svg
                                viewBox="0 0 16 16"
                                width="12"
                                height="12"
                                fill="none"
                            >
                                <path
                                    d="M4.2 6.2 8 10l3.8-3.8"
                                    stroke="currentColor"
                                    stroke-width="1.7"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </span>
                        <span class="group-name">{{ groupLabel(group) }}</span>
                        <span class="count">{{ list.length }}</span>
                        <div class="group-actions">
                            <button
                                type="button"
                                class="btn ghost mini"
                                @click.stop="openRenameGroup(group)"
                            >
                                {{ t('hosts.rename') }}
                            </button>
                            <button
                                type="button"
                                class="btn danger mini"
                                @click.stop="openRemoveGroup(group)"
                            >
                                {{ t('hosts.deleteGroup') }}
                            </button>
                        </div>
                    </div>

                    <div
                        :id="`group-panel-${index}`"
                        class="mgr-panel"
                        role="region"
                        :aria-hidden="!isGroupOpen(group)"
                    >
                        <div class="mgr-panel-inner">
                            <div v-if="list.length" class="mgr-list">
                                <div
                                    v-for="host in list"
                                    :key="host.id"
                                    class="mgr-row"
                                    :class="{
                                        busy: connectingHostId === host.id,
                                    }"
                                    role="button"
                                    tabindex="0"
                                    :aria-disabled="!!connectingHostId"
                                    @click="connect(host.id)"
                                    @keydown.enter.prevent="connect(host.id)"
                                    @keydown.space.prevent="connect(host.id)"
                                >
                                    <span
                                        class="status"
                                        :class="{ on: false }"
                                    />
                                    <div class="meta">
                                        <strong>{{ host.name }}</strong>
                                        <span>
                                            {{ host.username }}@{{
                                                host.host
                                            }}:{{ host.port }}
                                            ·
                                            {{
                                                host.authType === 'password'
                                                    ? t('hosts.authPassword')
                                                    : t('hosts.authKey')
                                            }}
                                        </span>
                                        <span v-if="host.note" class="note">{{
                                            host.note
                                        }}</span>
                                    </div>
                                    <div class="row-actions" @click.stop>
                                        <button
                                            type="button"
                                            class="row-icon-btn"
                                            :class="{
                                                copied:
                                                    copiedHostId === host.id,
                                            }"
                                            :title="
                                                copiedHostId === host.id
                                                    ? t('hosts.copySshCopied')
                                                    : t('hosts.copySsh')
                                            "
                                            :aria-label="t('hosts.copySsh')"
                                            :disabled="!!connectingHostId"
                                            @click="copySshCommand(host)"
                                        >
                                            <svg
                                                v-if="copiedHostId === host.id"
                                                viewBox="0 0 16 16"
                                                width="13"
                                                height="13"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    d="M3.5 8.5 6.5 11.5 12.5 4.5"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="1.5"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                />
                                            </svg>
                                            <svg
                                                v-else
                                                viewBox="0 0 16 16"
                                                width="13"
                                                height="13"
                                                aria-hidden="true"
                                            >
                                                <rect
                                                    x="5.5"
                                                    y="5.5"
                                                    width="7"
                                                    height="8"
                                                    rx="1.2"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="1.4"
                                                />
                                                <path
                                                    d="M4 11.2V3.7A1.2 1.2 0 0 1 5.2 2.5h5.6"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="1.4"
                                                    stroke-linecap="round"
                                                />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            class="row-icon-btn"
                                            :title="t('common.edit')"
                                            :aria-label="t('common.edit')"
                                            :disabled="!!connectingHostId"
                                            @click="ui.openConnectModal(host)"
                                        >
                                            <svg
                                                viewBox="0 0 16 16"
                                                width="13"
                                                height="13"
                                                aria-hidden="true"
                                            >
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
                                            class="row-icon-btn primary"
                                            :class="{
                                                busy:
                                                    connectingHostId ===
                                                    host.id,
                                            }"
                                            :title="
                                                connectingHostId === host.id
                                                    ? t('common.connecting')
                                                    : t('common.connect')
                                            "
                                            :aria-label="
                                                connectingHostId === host.id
                                                    ? t('common.connecting')
                                                    : t('common.connect')
                                            "
                                            :disabled="!!connectingHostId"
                                            @click="connect(host.id)"
                                        >
                                            <svg
                                                v-if="
                                                    connectingHostId !== host.id
                                                "
                                                viewBox="0 0 16 16"
                                                width="13"
                                                height="13"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    d="M5.5 3.2 12.2 8 5.5 12.8Z"
                                                    fill="currentColor"
                                                />
                                            </svg>
                                            <span
                                                v-else
                                                class="row-spin"
                                                aria-hidden="true"
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            class="row-icon-btn danger"
                                            :title="t('common.delete')"
                                            :aria-label="t('common.delete')"
                                            :disabled="!!connectingHostId"
                                            @click="
                                                openRemoveHost(
                                                    host.id,
                                                    host.name,
                                                )
                                            "
                                        >
                                            <svg
                                                viewBox="0 0 16 16"
                                                width="13"
                                                height="13"
                                                aria-hidden="true"
                                            >
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
                            <div v-else class="mgr-empty">—</div>
                        </div>
                    </div>
                </div>

                <div v-if="!groups.length" class="empty">
                    {{ t('hosts.empty') }}
                </div>
            </div>

            <div
                v-if="nameDialog"
                class="prompt-overlay"
                @click.self="closeNameDialog"
                @keydown.esc.prevent="closeNameDialog"
            >
                <div
                    class="prompt-box"
                    role="dialog"
                    :aria-label="nameDialogTitle"
                >
                    <h3>{{ nameDialogTitle }}</h3>
                    <div class="field">
                        <label for="groupNameInput">{{
                            nameDialogLabel
                        }}</label>
                        <input
                            id="groupNameInput"
                            ref="nameInputEl"
                            v-model="nameInput"
                            type="text"
                            autocomplete="off"
                            :disabled="nameSaving"
                            @keydown.enter.prevent="submitNameDialog"
                        />
                    </div>
                    <div class="prompt-actions">
                        <button
                            type="button"
                            class="btn ghost md"
                            :disabled="nameSaving"
                            @click="closeNameDialog"
                        >
                            {{ t('common.cancel') }}
                        </button>
                        <button
                            type="button"
                            class="btn primary md"
                            :disabled="nameSaving || !nameInput.trim()"
                            @click="submitNameDialog"
                        >
                            {{
                                nameSaving
                                    ? t('common.saving')
                                    : t('common.save')
                            }}
                        </button>
                    </div>
                </div>
            </div>

            <div
                v-if="confirmDialog"
                class="prompt-overlay"
                @click.self="closeConfirmDialog"
                @keydown.esc.prevent="closeConfirmDialog"
            >
                <div
                    class="prompt-box"
                    role="dialog"
                    :aria-label="t('common.confirm')"
                >
                    <h3>{{ t('common.confirm') }}</h3>
                    <p class="prompt-message">{{ confirmMessage }}</p>
                    <div class="prompt-actions">
                        <button
                            type="button"
                            class="btn ghost md"
                            :disabled="confirmBusy"
                            @click="closeConfirmDialog"
                        >
                            {{ t('common.cancel') }}
                        </button>
                        <button
                            type="button"
                            class="btn danger md"
                            :disabled="confirmBusy"
                            @click="submitConfirmDialog"
                        >
                            {{
                                confirmBusy
                                    ? t('common.saving')
                                    : t('common.delete')
                            }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.modal {
    position: relative;
}

.hosts-modal {
    width: min(calc(560px * var(--ui-scale, 1)), 100%);
    min-height: min(calc(360px * var(--ui-scale, 1)), calc(100vh - 48px));
}

.hosts-modal :deep(.modal-head) {
    padding: calc(10px * var(--ui-scale, 1)) calc(12px * var(--ui-scale, 1));
}

.hosts-modal :deep(.modal-body) {
    padding: calc(10px * var(--ui-scale, 1)) calc(12px * var(--ui-scale, 1));
}

.hosts-modal :deep(.modal-head h2) {
    font-size: calc(14px * var(--ui-scale, 1));
}

.hosts-modal :deep(.modal-head .sub) {
    margin-top: 1px;
}

.hosts-modal :deep(.modal-tools) {
    gap: calc(4px * var(--ui-scale, 1));
}

.mgr-group {
    margin-bottom: calc(6px * var(--ui-scale, 1));
    border: 1px solid var(--border-soft);
    border-radius: calc(8px * var(--ui-scale, 1));
    overflow: hidden;
    background: var(--bg-elevated);
    transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease;
}

.mgr-group.open {
    border-color: var(--border);
    box-shadow: 0 1px 0 rgba(62, 207, 142, 0.08);
}

.mgr-group-head {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--ui-scale, 1));
    padding: calc(6px * var(--ui-scale, 1)) calc(8px * var(--ui-scale, 1));
    background: var(--bg-hover);
    border-bottom: 1px solid transparent;
    font-size: calc(12px * var(--ui-scale, 1));
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    transition:
        background 0.15s ease,
        border-color 0.2s ease;
}

.mgr-group.open .mgr-group-head {
    border-bottom-color: var(--border-soft);
}

.mgr-group-head:hover {
    background: var(--bg-active);
}

.chev {
    display: inline-grid;
    place-items: center;
    width: calc(16px * var(--ui-scale, 1));
    height: calc(16px * var(--ui-scale, 1));
    border-radius: calc(4px * var(--ui-scale, 1));
    color: var(--text-dim);
    background: var(--bg-root);
    border: 1px solid var(--border-soft);
    transition:
        transform 0.22s ease,
        color 0.15s ease,
        border-color 0.15s ease;
}

.mgr-group:not(.open) .chev {
    transform: rotate(-90deg);
}

.mgr-group.open .chev,
.mgr-group-head:hover .chev {
    color: var(--accent);
    border-color: var(--accent-border);
}

.group-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.count {
    min-width: calc(18px * var(--ui-scale, 1));
    height: calc(18px * var(--ui-scale, 1));
    padding: 0 calc(5px * var(--ui-scale, 1));
    border-radius: calc(999px * var(--ui-scale, 1));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: calc(10px * var(--ui-scale, 1));
    color: var(--text-muted);
    font-family: var(--font-mono);
    background: var(--bg-root);
    border: 1px solid var(--border-soft);
}

.group-actions {
    margin-left: auto;
    display: flex;
    gap: calc(2px * var(--ui-scale, 1));
}

.mgr-panel {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.28s ease;
}

.mgr-group.open .mgr-panel {
    grid-template-rows: 1fr;
}

.mgr-panel-inner {
    overflow: hidden;
    min-height: 0;
}

.mgr-list {
    display: flex;
    flex-direction: column;
}

.mgr-empty {
    padding: calc(8px * var(--ui-scale, 1));
    text-align: center;
    color: var(--text-dim);
    font-size: calc(12px * var(--ui-scale, 1));
}

.mgr-row {
    display: grid;
    grid-template-columns: calc(14px * var(--ui-scale, 1)) 1fr auto;
    gap: calc(8px * var(--ui-scale, 1));
    align-items: center;
    padding: calc(6px * var(--ui-scale, 1)) calc(8px * var(--ui-scale, 1));
    border-top: 1px solid var(--border-soft);
    font-size: calc(12px * var(--ui-scale, 1));
    cursor: pointer;
    outline: none;
    transition: background 0.15s ease;
}

.mgr-row:first-child {
    border-top: none;
}

.mgr-row:hover,
.mgr-row:focus-visible,
.mgr-row.busy {
    background: var(--bg-hover);
}

.status {
    width: calc(7px * var(--ui-scale, 1));
    height: calc(7px * var(--ui-scale, 1));
    border-radius: 50%;
    background: var(--text-dim);
}
.status.on {
    background: var(--accent);
}

.meta strong {
    display: block;
    font-size: calc(12.5px * var(--ui-scale, 1));
    line-height: 1.25;
}
.meta span {
    font-size: calc(10.5px * var(--ui-scale, 1));
    line-height: 1.3;
    color: var(--text-muted);
    font-family: var(--font-mono);
}
.note {
    display: block;
    margin-top: 1px;
    font-family: var(--font-ui) !important;
    color: var(--text-dim) !important;
}

.row-actions {
    display: flex;
    align-items: center;
    gap: calc(2px * var(--ui-scale, 1));
}

.row-icon-btn {
    width: calc(26px * var(--ui-scale, 1));
    height: calc(26px * var(--ui-scale, 1));
    border: none;
    border-radius: calc(5px * var(--ui-scale, 1));
    background: transparent;
    color: var(--text-dim);
    display: grid;
    place-items: center;
}

.row-icon-btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--bg-active);
}

.row-icon-btn.copied {
    color: var(--accent);
}

.row-icon-btn.primary {
    color: var(--accent);
}

.row-icon-btn.primary:hover:not(:disabled) {
    color: var(--accent);
    background: var(--accent-dim);
}

.row-icon-btn.danger:hover:not(:disabled) {
    color: var(--danger);
    background: var(--danger-dim);
}

.row-icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.row-spin {
    width: calc(11px * var(--ui-scale, 1));
    height: calc(11px * var(--ui-scale, 1));
    border: calc(1.5px * var(--ui-scale, 1)) solid var(--accent-border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: host-row-spin 0.7s linear infinite;
}

@keyframes host-row-spin {
    to {
        transform: rotate(360deg);
    }
}

.empty {
    color: var(--text-muted);
    font-size: calc(13px * var(--ui-scale, 1));
    padding: calc(16px * var(--ui-scale, 1));
    text-align: center;
}

.prompt-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(24px * var(--ui-scale, 1));
    background: var(--overlay);
}

.prompt-box {
    width: min(calc(360px * var(--ui-scale, 1)), 100%);
    padding: calc(16px * var(--ui-scale, 1));
    border-radius: calc(10px * var(--ui-scale, 1));
    border: 1px solid var(--border);
    background: var(--bg-panel);
    box-shadow: 0 calc(12px * var(--ui-scale, 1)) calc(40px * var(--ui-scale, 1)) rgba(0, 0, 0, 0.28);
}

.prompt-box h3 {
    margin: 0 0 calc(12px * var(--ui-scale, 1));
    font-size: calc(14px * var(--ui-scale, 1));
    font-weight: 600;
}

.prompt-message {
    margin: 0;
    font-size: calc(13px * var(--ui-scale, 1));
    line-height: 1.5;
    color: var(--text-muted);
}

.prompt-actions {
    display: flex;
    justify-content: flex-end;
    gap: calc(8px * var(--ui-scale, 1));
    margin-top: calc(14px * var(--ui-scale, 1));
}
</style>
