/**
 * Vault wrappers. Crypto stays in Rust; this layer only forwards the login
 * password and opaque envelopes. Plaintext secrets never enter JS.
 */
import * as api from '../api/tauri'
import type { VaultEnvelope } from '../types/sync'
import { parseVaultEnvelope } from '../types/sync'

function asEnvelope(raw: Record<string, unknown>): VaultEnvelope {
    const parsed = parseVaultEnvelope(raw)
    if (!parsed) throw new Error('vault_envelope')
    return parsed
}

export function unlock(password: string, envelope?: VaultEnvelope | null) {
    return api.vaultUnlock(password, envelope ? { ...envelope } : null)
}

export function lock() {
    return api.vaultLock()
}

export function isUnlocked() {
    return api.vaultIsUnlocked()
}

export async function encryptSecrets(): Promise<VaultEnvelope> {
    return asEnvelope(await api.vaultEncryptSecrets())
}

export function decryptAndImport(envelope: VaultEnvelope) {
    return api.vaultDecryptAndImport({ ...envelope })
}

/** Union cloud secrets into local; local keys win on conflict (offline login merge). */
export function decryptAndMergeImport(envelope: VaultEnvelope) {
    return api.vaultDecryptAndMergeImport({ ...envelope })
}
