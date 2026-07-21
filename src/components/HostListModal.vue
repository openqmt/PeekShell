<script setup lang="ts">
/** 主机列表：分组、连接、编辑、删除。 */
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from '../i18n'
import { useHostsStore } from '../stores/hosts'
import { useSessionsStore } from '../stores/sessions'
import { useUiStore } from '../stores/ui'

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

const nameDialogTitle = computed(() =>
    nameDialog.value?.mode === 'rename'
        ? t('hosts.rename')
        : t('hosts.addGroup')
)
const nameDialogLabel = computed(() =>
    nameDialog.value?.mode === 'rename'
        ? t('hosts.renameGroupPrompt')
        : t('hosts.newGroupPrompt')
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
        JSON.stringify([...collapsedGroups.value])
    )
}

onMounted(() => {
    void hosts.refresh()
})

function isGroupCollapsed(group: string) {
    return collapsedGroups.value.has(group)
}

function toggleGroup(group: string) {
    const next = new Set(collapsedGroups.value)
    if (next.has(group)) next.delete(group)
    else next.add(group)
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

function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) ui.closeHostsModal()
}
</script>

<template>
    <div class="overlay" @click="onBackdrop">
        <div class="modal hosts-modal" role="dialog" aria-labelledby="hostsTitle">
            <div class="modal-head">
                <div>
                    <h2 id="hostsTitle">{{ t('hosts.title') }}</h2>
                    <div class="sub">{{ t('hosts.sub') }}</div>
                </div>
                <div class="modal-tools">
                    <button
                        type="button"
                        class="btn primary md"
                        @click="ui.openConnectModal(null)"
                    >
                        {{ t('hosts.addConnection') }}
                    </button>
                    <button
                        type="button"
                        class="btn ghost md"
                        @click="openCreateGroup"
                    >
                        {{ t('hosts.addGroup') }}
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
                        :title="
                            isGroupCollapsed(group)
                                ? t('hosts.expandGroup')
                                : t('hosts.collapseGroup')
                        "
                        @click="toggleGroup(group)"
                        @keydown.enter.prevent="toggleGroup(group)"
                        @keydown.space.prevent="toggleGroup(group)"
                    >
                        <span class="chev" aria-hidden="true">▾</span>
                        <span>{{ groupLabel(group) }}</span>
                        <span class="count">{{ list.length }}</span>
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
                    <template v-if="!isGroupCollapsed(group)">
                        <div
                            v-for="host in list"
                            :key="host.id"
                            class="mgr-row"
                        >
                            <span class="status" :class="{ on: false }" />
                            <div class="meta">
                                <strong>{{ host.name }}</strong>
                                <span>
                                    {{ host.username }}@{{ host.host }}:{{
                                        host.port
                                    }}
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
                            <div class="row-actions">
                                <button
                                    type="button"
                                    class="btn primary mini"
                                    :disabled="!!connectingHostId"
                                    @click="ui.openConnectModal(host)"
                                >
                                    {{ t('common.edit') }}
                                </button>
                                <button
                                    type="button"
                                    class="btn ghost mini"
                                    :disabled="!!connectingHostId"
                                    @click="connect(host.id)"
                                >
                                    {{
                                        connectingHostId === host.id
                                            ? t('common.connecting')
                                            : t('common.connect')
                                    }}
                                </button>
                                <button
                                    type="button"
                                    class="btn danger mini"
                                    :disabled="!!connectingHostId"
                                    @click="openRemoveHost(host.id, host.name)"
                                >
                                    {{ t('common.delete') }}
                                </button>
                            </div>
                        </div>
                    </template>
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
    width: min(560px, 100%);
}

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

.mgr-row:first-of-type {
    border-top: none;
}
.mgr-row:hover {
    background: var(--bg-hover);
}

.status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-dim);
}
.status.on {
    background: var(--accent);
}

.meta strong {
    display: block;
    font-size: 13px;
}
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

.row-actions {
    display: flex;
    gap: 4px;
}
.empty {
    color: var(--text-muted);
    font-size: 13px;
    padding: 24px;
    text-align: center;
}

.prompt-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--overlay);
}

.prompt-box {
    width: min(360px, 100%);
    padding: 16px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}

.prompt-box h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
}

.prompt-message {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-muted);
}

.prompt-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
}
</style>
