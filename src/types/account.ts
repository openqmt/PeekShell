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
