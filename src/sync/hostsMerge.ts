/**
 * Merge `hosts` sync payloads by host id (union). Used on login and restore
 * so offline local hosts are not discarded when the cloud copy is newer.
 */
import type { AuthType } from '../types/host'

export interface HostSyncRecord {
    id: string
    name: string
    group: string
    host: string
    port: number
    note: string
    username: string
    authType: AuthType
    privateKeyPath?: string | null
}

export interface HostsSyncPayload {
    groups: string[]
    hosts: HostSyncRecord[]
}

export type HostConflictPolicy = 'prefer-local' | 'prefer-remote' | 'prefer-newer-doc'

function parseHostRecord(item: unknown): HostSyncRecord | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || !row.id.trim()) return null
    if (typeof row.host !== 'string' || !row.host.trim()) return null
    if (typeof row.username !== 'string' || !row.username.trim()) return null
    const authType: AuthType = row.authType === 'privateKey' ? 'privateKey' : 'password'
    return {
        id: row.id.trim(),
        name: typeof row.name === 'string' ? row.name : '',
        group: typeof row.group === 'string' ? row.group : '',
        host: row.host.trim(),
        port: typeof row.port === 'number' && Number.isFinite(row.port) ? row.port : 22,
        note: typeof row.note === 'string' ? row.note : '',
        username: row.username.trim(),
        authType,
        privateKeyPath: typeof row.privateKeyPath === 'string' ? row.privateKeyPath : null,
    }
}

export function parseHostsPayload(payload: Record<string, unknown>): HostsSyncPayload {
    const hosts: HostSyncRecord[] = []
    if (Array.isArray(payload.hosts)) {
        for (const item of payload.hosts) {
            const row = parseHostRecord(item)
            if (row) hosts.push(row)
        }
    }
    const groups = Array.isArray(payload.groups)
        ? payload.groups.filter((g): g is string => typeof g === 'string' && g.trim() !== '')
        : []
    return { groups, hosts }
}

export function mergeHostsById(
    local: HostsSyncPayload,
    remote: HostsSyncPayload,
    opts: { policy: HostConflictPolicy; localDocTime: number; remoteDocTime: number },
): HostsSyncPayload {
    const localById = new Map(local.hosts.map((h) => [h.id, h]))
    const remoteById = new Map(remote.hosts.map((h) => [h.id, h]))

    const pick = (id: string): HostSyncRecord | undefined => {
        const l = localById.get(id)
        const r = remoteById.get(id)
        if (l && !r) return l
        if (r && !l) return r
        if (!l || !r) return undefined
        if (opts.policy === 'prefer-local') return l
        if (opts.policy === 'prefer-remote') return r
        return opts.localDocTime >= opts.remoteDocTime ? l : r
    }

    const hosts: HostSyncRecord[] = []
    const seen = new Set<string>()
    for (const h of remote.hosts) {
        const picked = pick(h.id)
        if (picked && !seen.has(picked.id)) {
            hosts.push(picked)
            seen.add(picked.id)
        }
    }
    for (const h of local.hosts) {
        if (!seen.has(h.id)) {
            const picked = pick(h.id)
            if (picked) {
                hosts.push(picked)
                seen.add(picked.id)
            }
        }
    }

    const groupSet = new Set<string>([...local.groups, ...remote.groups])
    for (const h of hosts) {
        if (h.group.trim()) groupSet.add(h.group.trim())
    }
    return { groups: [...groupSet].sort((a, b) => a.localeCompare(b)), hosts }
}

export function hostsPayloadToRecord(payload: HostsSyncPayload): Record<string, unknown> {
    return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
}

export function hostsPayloadsEqual(a: HostsSyncPayload, b: HostsSyncPayload): boolean {
    const norm = (p: HostsSyncPayload) =>
        JSON.stringify({
            groups: [...p.groups].sort(),
            hosts: [...p.hosts].sort((x, y) => x.id.localeCompare(y.id)),
        })
    return norm(a) === norm(b)
}

export function hostsPayloadEmpty(payload: HostsSyncPayload): boolean {
    return payload.hosts.length === 0 && payload.groups.length === 0
}
