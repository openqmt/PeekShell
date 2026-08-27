/**
 * PeekServer HTTP client (phase-1 auth + sync).
 * Base URL: `VITE_CLOUD_API_URL`, default local Worker `http://127.0.0.1:8787`.
 * Tokens travel in `Authorization: Bearer`; CORS is origin-open on the server.
 */
import {
    parseAuthSession,
    parseUserProfile,
    type AuthSession,
    type UserProfile,
} from '../types/account'
import {
    parseSyncAll,
    parseSyncDocument,
    type SyncCollection,
    type SyncDocument,
} from '../types/sync'

export class CloudApiError extends Error {
    readonly code: string

    constructor(code: string, message: string) {
        super(message)
        this.name = 'CloudApiError'
        this.code = code
    }
}

/** PUT /sync/:collection 409: server copy won LWW; retry from `document`. */
export class CloudConflictError extends CloudApiError {
    readonly document: SyncDocument

    constructor(message: string, document: SyncDocument) {
        super('conflict', message)
        this.name = 'CloudConflictError'
        this.document = document
    }
}

function apiBase(): string {
    const raw = import.meta.env.VITE_CLOUD_API_URL?.trim()
    return (raw || 'http://127.0.0.1:8787').replace(/\/+$/, '')
}

async function request(path: string, init: RequestInit & { token?: string }): Promise<unknown> {
    const { token, ...rest } = init
    const headers = new Headers(rest.headers)
    if (rest.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
    }
    if (token) headers.set('Authorization', `Bearer ${token}`)

    let res: Response
    try {
        res = await fetch(`${apiBase()}${path}`, { ...rest, headers })
    } catch {
        throw new CloudApiError('network', 'Network error')
    }

    const text = await res.text()
    let body: unknown = null
    if (text) {
        try {
            body = JSON.parse(text)
        } catch {
            throw new CloudApiError('internal', 'Invalid response')
        }
    }

    if (!res.ok) {
        const err =
            body && typeof body === 'object'
                ? (body as { error?: unknown; message?: unknown; document?: unknown })
                : {}
        const code = typeof err.error === 'string' ? err.error : 'internal'
        const message =
            typeof err.message === 'string' ? err.message : 'Request failed'
        if (res.status === 409 && code === 'conflict') {
            const document = parseSyncDocument(err.document)
            if (document) throw new CloudConflictError(message, document)
        }
        throw new CloudApiError(code, message)
    }
    return body
}

function requireSession(raw: unknown): AuthSession {
    const session = parseAuthSession(raw)
    if (!session) throw new CloudApiError('internal', 'Invalid auth response')
    return session
}

function requireProfile(raw: unknown): UserProfile {
    const user = parseUserProfile(raw)
    if (!user) throw new CloudApiError('internal', 'Invalid profile response')
    return user
}

export function register(
    email: string,
    password: string,
    nickname?: string,
): Promise<AuthSession> {
    const body: { email: string; password: string; nickname?: string } = {
        email,
        password,
    }
    if (nickname) body.nickname = nickname
    return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
    }).then(requireSession)
}

export function login(email: string, password: string): Promise<AuthSession> {
    return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    }).then(requireSession)
}

export function logout(token: string): Promise<void> {
    return request('/auth/logout', { method: 'POST', token }).then(() => undefined)
}

export function getMe(token: string): Promise<UserProfile> {
    return request('/auth/me', { method: 'GET', token }).then(requireProfile)
}

function requireDocument(raw: unknown): SyncDocument {
    const doc = parseSyncDocument(raw)
    if (!doc) throw new CloudApiError('internal', 'Invalid sync response')
    return doc
}

/** Pull every collection the user has uploaded. Missing collections are omitted. */
export function getAllSync(
    token: string,
): Promise<Record<string, SyncDocument>> {
    return request('/sync', { method: 'GET', token }).then(parseSyncAll)
}

/** Write one collection (LWW). 409 is thrown as CloudConflictError with the winning copy. */
export function putSync(
    token: string,
    collection: SyncCollection,
    body: {
        payload: Record<string, unknown>
        updatedAt: string
        baseRevision: number | null
    },
): Promise<SyncDocument> {
    return request(`/sync/${collection}`, {
        method: 'PUT',
        token,
        body: JSON.stringify(body),
    }).then(requireDocument)
}
