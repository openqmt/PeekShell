/**
 * Debounced sync queue. Stores call `enqueueSync` after local edits;
 * the client binds the flush callback so this file stays free of store imports.
 */
import type { SyncCollection } from '../types/sync'

const DEBOUNCE_MS = 1000

const pending = new Set<SyncCollection>()
let timer: ReturnType<typeof setTimeout> | null = null
let applyDepth = 0
let enabled = false
let onFlush: (() => void) | null = null

export async function withApplyingRemote<T>(fn: () => Promise<T>): Promise<T> {
    applyDepth += 1
    try {
        return await fn()
    } finally {
        applyDepth -= 1
    }
}

export function setSyncEnabled(value: boolean) {
    enabled = value
    if (!value) {
        pending.clear()
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }
}

export function bindSyncFlush(fn: () => void) {
    onFlush = fn
}

/** Queue a collection for PUT after a local edit. Ignored while applying a cloud copy. */
export function enqueueSync(collection: SyncCollection) {
    if (!enabled || applyDepth > 0) return
    pending.add(collection)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
        timer = null
        onFlush?.()
    }, DEBOUNCE_MS)
}

export function drainPending(): SyncCollection[] {
    const batch = [...pending]
    pending.clear()
    return batch
}
