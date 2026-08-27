/** PeekServer sync collection names (API.md §同步接口). */
export const SYNC_COLLECTIONS = [
    'hosts',
    'display',
    'models',
    'terminal',
    'quick_commands',
    'secrets_enc',
] as const

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number]

/** One LWW document as stored by PeekServer. `payload` is an opaque JSON object. */
export interface SyncDocument {
    payload: Record<string, unknown>
    updatedAt: string
    revision: number
}

/** Client-side AES-GCM envelope for `secrets_enc`. Server validates shape only. */
export interface VaultEnvelope {
    v: number
    kdf: string
    salt: string
    nonce: string
    ciphertext: string
    verifier: string
}

const COLLECTIONS = new Set<string>(SYNC_COLLECTIONS)

export function isSyncCollection(value: string): value is SyncCollection {
    return COLLECTIONS.has(value)
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
    return !!raw && typeof raw === 'object' && !Array.isArray(raw)
}

/** Parse a SyncDocument; return null when the shape is wrong. */
export function parseSyncDocument(raw: unknown): SyncDocument | null {
    if (!isPlainObject(raw)) return null
    if (!isPlainObject(raw.payload)) return null
    if (typeof raw.updatedAt !== 'string' || !raw.updatedAt) return null
    if (typeof raw.revision !== 'number' || !Number.isInteger(raw.revision)) {
        return null
    }
    return {
        payload: raw.payload,
        updatedAt: raw.updatedAt,
        revision: raw.revision,
    }
}

/** Parse GET /sync `{ collections: { [name]: SyncDocument } }`. Unknown names are dropped. */
export function parseSyncAll(
    raw: unknown,
): Record<string, SyncDocument> {
    if (!isPlainObject(raw)) return {}
    const collections = raw.collections
    if (!isPlainObject(collections)) return {}
    const out: Record<string, SyncDocument> = {}
    for (const [name, doc] of Object.entries(collections)) {
        if (!isSyncCollection(name)) continue
        const parsed = parseSyncDocument(doc)
        if (parsed) out[name] = parsed
    }
    return out
}

/** Parse a `secrets_enc` payload as a vault envelope; return null when invalid. */
export function parseVaultEnvelope(raw: unknown): VaultEnvelope | null {
    if (!isPlainObject(raw)) return null
    if (typeof raw.v !== 'number') return null
    if (typeof raw.kdf !== 'string' || !raw.kdf) return null
    for (const field of ['salt', 'nonce', 'ciphertext', 'verifier'] as const) {
        if (typeof raw[field] !== 'string' || !raw[field]) return null
    }
    return {
        v: raw.v,
        kdf: raw.kdf,
        salt: raw.salt as string,
        nonce: raw.nonce as string,
        ciphertext: raw.ciphertext as string,
        verifier: raw.verifier as string,
    }
}
