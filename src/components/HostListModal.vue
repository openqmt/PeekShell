<script setup lang="ts">
/** 主机列表：分组、连接、编辑、删除。 */
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
            list.map(([g]) => g).filter((g) => g !== keep)
        )
        persistCollapsed()
    },
    { immediate: true }
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
                        class="btn primary"
                        @click="ui.openConnectModal(null)"
                    >
                        {{ t('hosts.addConnection') }}
                    </button>
                    <button
                        type="button"
                        class="btn ghost"
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
                                        <span
                                            v-if="host.note"
                                            class="note"
                                            >{{ host.note }}</span
                                        >
                                    </div>
                                    <div class="row-actions" @click.stop>
                                        <button
                                            type="button"
                                            class="btn ghost mini"
                                            :disabled="!!connectingHostId"
                                            @click="ui.openConnectModal(host)"
                                        >
                                            {{ t('common.edit') }}
                                        </button>
                                        <button
                                            type="button"
                                            class="btn primary mini"
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
                                            @click="
                                                openRemoveHost(
                                                    host.id,
                                                    host.name
                                                )
                                            "
                                        >
                                            {{ t('common.delete') }}
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
    width: min(560px, 100%);
}

.hosts-modal :deep(.modal-head) {
    padding: 10px 12px;
}

.hosts-modal :deep(.modal-body) {
    padding: 10px 12px;
}

.hosts-modal :deep(.modal-head h2) {
    font-size: 14px;
}

.hosts-modal :deep(.modal-head .sub) {
    margin-top: 1px;
}

.hosts-modal :deep(.modal-tools) {
    gap: 4px;
}

.mgr-group {
    margin-bottom: 6px;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-elevated);
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.mgr-group.open {
    border-color: var(--border);
    box-shadow: 0 1px 0 rgba(62, 207, 142, 0.08);
}

.mgr-group-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: var(--bg-hover);
    border-bottom: 1px solid transparent;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease, border-color 0.2s ease;
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
    width: 16px;
    height: 16px;
    border-radius: 4px;
    color: var(--text-dim);
    background: var(--bg-root);
    border: 1px solid var(--border-soft);
    transition: transform 0.22s ease, color 0.15s ease, border-color 0.15s ease;
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
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 10px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    background: var(--bg-root);
    border: 1px solid var(--border-soft);
}

.group-actions {
    margin-left: auto;
    display: flex;
    gap: 2px;
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
    padding: 8px;
    text-align: center;
    color: var(--text-dim);
    font-size: 12px;
}

.mgr-row {
    display: grid;
    grid-template-columns: 14px 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-top: 1px solid var(--border-soft);
    font-size: 12px;
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
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-dim);
}
.status.on {
    background: var(--accent);
}

.meta strong {
    display: block;
    font-size: 12.5px;
    line-height: 1.25;
}
.meta span {
    font-size: 10.5px;
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
    gap: 2px;
}
.empty {
    color: var(--text-muted);
    font-size: 13px;
    padding: 16px;
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
