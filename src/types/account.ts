/** Cloud account role; only the server may change it. */
export type AccountRole = 'user' | 'sponsor' | 'admin'

/** Public user profile returned by PeekServer `/auth/me`. */
export interface UserProfile {
    id: string
    email: string
    nickname: string
    points: number
    role: AccountRole
    createdAt: number
    updatedAt: number
}

/** Register / login response: bearer token plus public profile. */
export interface AuthSession {
    token: string
    user: UserProfile
}

const ROLES = new Set<AccountRole>(['user', 'sponsor', 'admin'])

/** Parse PeekServer UserProfile JSON; return null when the shape is wrong. */
export function parseUserProfile(raw: unknown): UserProfile | null {
    if (!raw || typeof raw !== 'object') return null
    const o = raw as Record<string, unknown>
    if (typeof o.id !== 'string' || !o.id) return null
    if (typeof o.email !== 'string' || !o.email) return null
    if (typeof o.nickname !== 'string') return null
    if (typeof o.points !== 'number' || !Number.isFinite(o.points)) return null
    if (typeof o.role !== 'string' || !ROLES.has(o.role as AccountRole)) {
        return null
    }
    if (typeof o.createdAt !== 'number' || !Number.isFinite(o.createdAt)) {
        return null
    }
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) {
        return null
    }
    return {
        id: o.id,
        email: o.email,
        nickname: o.nickname,
        points: o.points,
        role: o.role as AccountRole,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
    }
}

export function parseAuthSession(raw: unknown): AuthSession | null {
    if (!raw || typeof raw !== 'object') return null
    const o = raw as Record<string, unknown>
    if (typeof o.token !== 'string' || !o.token) return null
    const user = parseUserProfile(o.user)
    if (!user) return null
    return { token: o.token, user }
}
