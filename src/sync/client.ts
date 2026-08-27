/**
 * Phase-1 cloud sync client: GET/PUT /sync with per-collection Last-Write-Wins.
 *
 * After login the login password unlocks the vault (Argon2id + AES-GCM in Rust).
 * `secrets_enc` plaintext never enters JS. On app restart the token is restored
 * but the vault stays locked until the next login — non-secret collections still sync.
 */
import { watch } from 'vue'
import { CloudApiError, CloudConflictError, getAllSync, putSync } from '../api/cloud'
import { useAiStore } from '../stores/ai'
import { useCloudSyncStore } from '../stores/cloudSync'
import { useEditorPrefsStore } from '../stores/editorPrefs'
import { useExplorerPrefsStore } from '../stores/explorerPrefs'
import { useHostsStore } from '../stores/hosts'
import { useQuickCommandsStore } from '../stores/quickCommands'
import { useTerminalPrefsStore } from '../stores/terminalPrefs'
import { useUiStore } from '../stores/ui'
import {
    parseVaultEnvelope,
    SYNC_COLLECTIONS,
    type SyncCollection,
    type SyncDocument,
    type VaultEnvelope,
} from '../types/sync'
import { applyCollection, snapshotCollection } from './collections'
import {
    bindSyncFlush,
    drainPending,
    enqueueSync,
    setSyncEnabled,
    withApplyingRemote,
} from './queue'
import * as vault from './vault'

const META_KEY = 'peekshell.sync.meta'
const PLAIN_COLLECTIONS = [
    'hosts',
    'display',
    'models',
    'terminal',
    'quick_commands',
] as const satisfies Exclude<SyncCollection, 'secrets_enc'>[]

interface CollectionMeta {
    updatedAt: string
    revision: number
}

interface SyncMetaFile {
    userId: string
    collections: Partial<Record<SyncCollection, CollectionMeta>>
}

let sessionToken = ''
let sessionUserId = ''
let watchersStarted = false
let flushing = false

function emptyMeta(userId = ''): SyncMetaFile {
    return { userId, collections: {} }
}

function loadMeta(): SyncMetaFile {
    try {
        const raw = localStorage.getItem(META_KEY)
        if (!raw) return emptyMeta()
        const parsed = JSON.parse(raw) as Partial<SyncMetaFile>
        if (typeof parsed.userId !== 'string') return emptyMeta()
        const collections: SyncMetaFile['collections'] = {}
        if (parsed.collections && typeof parsed.collections === 'object') {
            for (const name of SYNC_COLLECTIONS) {
                const row = parsed.collections[name]
                if (
                    row &&
                    typeof row.updatedAt === 'string' &&
                    typeof row.revision === 'number' &&
                    Number.isInteger(row.revision)
                ) {
                    collections[name] = {
                        updatedAt: row.updatedAt,
                        revision: row.revision,
                    }
                }
            }
        }
        return { userId: parsed.userId, collections }
    } catch {
        return emptyMeta()
    }
}

function saveMeta(meta: SyncMetaFile) {
    try {
        localStorage.setItem(META_KEY, JSON.stringify(meta))
    } catch {
        // ignore quota / private mode
    }
}

function rememberDoc(name: SyncCollection, doc: SyncDocument) {
    const meta = loadMeta()
    meta.userId = sessionUserId
    meta.collections[name] = { updatedAt: doc.updatedAt, revision: doc.revision }
    saveMeta(meta)
}

function syncErrorCode(e: unknown): 'network' | 'vault' | 'sync' {
    if (e instanceof CloudApiError && e.code === 'network') return 'network'
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('vault_')) return 'vault'
    return 'sync'
}

async function refreshLocalStores() {
    await Promise.all([useHostsStore().refresh(), useAiStore().refresh()])
}

async function pushPlain(
    token: string,
    name: Exclude<SyncCollection, 'secrets_enc'>,
    keepLocalOnConflict: boolean,
) {
    const payload = await snapshotCollection(name)
    const meta = loadMeta().collections[name]
    const updatedAt = new Date().toISOString()
    try {
        const doc = await putSync(token, name, {
            payload,
            updatedAt,
            baseRevision: meta?.revision ?? null,
        })
        rememberDoc(name, doc)
    } catch (e) {
        if (e instanceof CloudConflictError) {
            if (keepLocalOnConflict) {
                const nextUpdatedAt = new Date(
                    Date.parse(e.document.updatedAt) + 1,
                ).toISOString()
                const doc = await putSync(token, name, {
                    payload,
                    updatedAt: nextUpdatedAt,
                    baseRevision: e.document.revision,
                })
                rememberDoc(name, doc)
                return
            }
            await applyCollection(name, e.document.payload)
            rememberDoc(name, e.document)
            return
        }
        throw e
    }
}

async function pushSecrets(token: string, keepLocalOnConflict: boolean) {
    if (!(await vault.isUnlocked())) return
    const envelope = await vault.encryptSecrets()
    const payload: Record<string, unknown> = { ...envelope }
    const meta = loadMeta().collections.secrets_enc
    const updatedAt = new Date().toISOString()
    try {
        const doc = await putSync(token, 'secrets_enc', {
            payload,
            updatedAt,
            baseRevision: meta?.revision ?? null,
        })
        rememberDoc('secrets_enc', doc)
    } catch (e) {
        if (e instanceof CloudConflictError) {
            if (keepLocalOnConflict) {
                const nextUpdatedAt = new Date(
                    Date.parse(e.document.updatedAt) + 1,
                ).toISOString()
                const doc = await putSync(token, 'secrets_enc', {
                    payload,
                    updatedAt: nextUpdatedAt,
                    baseRevision: e.document.revision,
                })
                rememberDoc('secrets_enc', doc)
                return
            }
            const remoteEnvelope = parseVaultEnvelope(e.document.payload)
            if (remoteEnvelope) await vault.decryptAndImport(remoteEnvelope)
            rememberDoc('secrets_enc', e.document)
            return
        }
        throw e
    }
}

async function mergePlain(
    token: string,
    name: Exclude<SyncCollection, 'secrets_enc'>,
    remote: SyncDocument | undefined,
    localMeta: CollectionMeta | undefined,
) {
    if (!remote) {
        await pushPlain(token, name, false)
        return
    }
    if (!localMeta) {
        await applyCollection(name, remote.payload)
        rememberDoc(name, remote)
        return
    }
    const localTime = Date.parse(localMeta.updatedAt)
    const remoteTime = Date.parse(remote.updatedAt)
    if (remoteTime > localTime) {
        await applyCollection(name, remote.payload)
        rememberDoc(name, remote)
    } else if (localTime > remoteTime) {
        await pushPlain(token, name, true)
    } else {
        rememberDoc(name, remote)
    }
}

async function mergeSecrets(
    token: string,
    remote: SyncDocument | undefined,
    envelope: VaultEnvelope | null,
) {
    if (!(await vault.isUnlocked())) return
    const localMeta = loadMeta().collections.secrets_enc
    if (!remote) {
        await pushSecrets(token, false)
        return
    }
    if (!envelope) return
    if (!localMeta) {
        await vault.decryptAndImport(envelope)
        rememberDoc('secrets_enc', remote)
        return
    }
    const localTime = Date.parse(localMeta.updatedAt)
    const remoteTime = Date.parse(remote.updatedAt)
    if (remoteTime > localTime) {
        await vault.decryptAndImport(envelope)
        rememberDoc('secrets_enc', remote)
    } else if (localTime > remoteTime) {
        await pushSecrets(token, true)
    } else {
        rememberDoc('secrets_enc', remote)
    }
}

async function runFlush() {
    if (flushing || !sessionToken) return
    flushing = true
    const status = useCloudSyncStore()
    status.setSyncing(true)
    try {
        while (true) {
            const batch = drainPending()
            if (!batch.length) break
            for (const name of batch) {
                if (name === 'secrets_enc') await pushSecrets(sessionToken, true)
                else await pushPlain(sessionToken, name, true)
            }
        }
        status.setError('')
        status.markSynced()
    } catch (e) {
        status.setError(syncErrorCode(e))
    } finally {
        status.setSyncing(false)
        flushing = false
    }
}

function startWatchers() {
    if (watchersStarted) return
    watchersStarted = true
    bindSyncFlush(() => {
        void runFlush()
    })

    const ui = useUiStore()
    watch(
        () => [
            ui.theme,
            ui.locale,
            ui.aiPanelWidth,
            ui.sidebarWidth,
            ui.displayPrefs,
        ],
        () => enqueueSync('display'),
        { deep: true },
    )
    watch(
        () => useEditorPrefsStore().prefs,
        () => enqueueSync('display'),
        { deep: true },
    )
    watch(
        () => useExplorerPrefsStore().prefs,
        () => enqueueSync('display'),
        { deep: true },
    )
    watch(
        () => useTerminalPrefsStore().prefs,
        () => enqueueSync('terminal'),
        { deep: true },
    )
    const qc = useQuickCommandsStore()
    watch(
        () => [qc.groups, qc.commands],
        () => enqueueSync('quick_commands'),
        { deep: true },
    )
}

/**
 * Login/register: unlock vault with the password, pull all collections, LWW merge.
 * Password is not retained; only the derived key stays in Rust memory.
 */
export async function runInitialSync(
    token: string,
    userId: string,
    password: string,
) {
    sessionToken = token
    sessionUserId = userId
    const status = useCloudSyncStore()
    status.setSyncing(true)
    status.setError('')
    try {
        const remote = await getAllSync(token)
        const secretsDoc = remote.secrets_enc
        const envelope = secretsDoc
            ? parseVaultEnvelope(secretsDoc.payload)
            : null
        try {
            await vault.unlock(password, envelope)
        } catch (e) {
            status.setError(syncErrorCode(e))
            // Keep local secrets when the cloud envelope cannot be opened.
            if (!envelope) throw e
        }
        await withApplyingRemote(async () => {
            const meta = loadMeta()
            const localMeta =
                meta.userId === userId ? meta.collections : emptyMeta(userId).collections
            if (meta.userId !== userId) saveMeta(emptyMeta(userId))

            await mergeSecrets(token, secretsDoc, envelope)
            for (const name of PLAIN_COLLECTIONS) {
                await mergePlain(token, name, remote[name], localMeta[name])
            }
            await refreshLocalStores()
        })
        status.markSynced()
        setSyncEnabled(true)
        startWatchers()
    } catch (e) {
        status.setError(syncErrorCode(e))
        setSyncEnabled(true)
        startWatchers()
        throw e
    } finally {
        status.setSyncing(false)
    }
}

/**
 * Token restore on app start: sync non-secret collections. Vault stays locked
 * until the user signs in again, so `secrets_enc` is not re-encrypted.
 */
export async function runRestoreSync(token: string, userId: string) {
    sessionToken = token
    sessionUserId = userId
    const status = useCloudSyncStore()
    status.setSyncing(true)
    try {
        const remote = await getAllSync(token)
        await withApplyingRemote(async () => {
            const meta = loadMeta()
            const localMeta =
                meta.userId === userId ? meta.collections : emptyMeta(userId).collections
            if (meta.userId !== userId) saveMeta(emptyMeta(userId))
            for (const name of PLAIN_COLLECTIONS) {
                await mergePlain(token, name, remote[name], localMeta[name])
            }
            await refreshLocalStores()
        })
        status.setError('')
        status.markSynced()
    } catch (e) {
        status.setError(syncErrorCode(e))
    } finally {
        status.setSyncing(false)
        setSyncEnabled(true)
        startWatchers()
    }
}

export async function runManualSync() {
    if (!sessionToken) return
    const status = useCloudSyncStore()
    status.setSyncing(true)
    try {
        const remote = await getAllSync(sessionToken)
        await withApplyingRemote(async () => {
            const meta = loadMeta()
            const localMeta = meta.collections
            const secretsDoc = remote.secrets_enc
            const envelope = secretsDoc
                ? parseVaultEnvelope(secretsDoc.payload)
                : null
            await mergeSecrets(sessionToken, secretsDoc, envelope)
            for (const name of PLAIN_COLLECTIONS) {
                await mergePlain(sessionToken, name, remote[name], localMeta[name])
            }
            await refreshLocalStores()
        })
        status.setError('')
        status.markSynced()
    } catch (e) {
        status.setError(syncErrorCode(e))
    } finally {
        status.setSyncing(false)
    }
}

export async function stopSync() {
    setSyncEnabled(false)
    sessionToken = ''
    sessionUserId = ''
    useCloudSyncStore().reset()
    try {
        await vault.lock()
    } catch {
        // native side may already be gone
    }
}
