/**
 * Cloud account session for User Center.
 * Talks to PeekServer `/auth/*`; token + profile persist in localStorage.
 * After login the password unlocks the vault and triggers collection sync.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as cloud from '../api/cloud'
import { parseUserProfile, type UserProfile } from '../types/account'
import * as cloudSync from '../sync/client'

const TOKEN_KEY = 'peekshell.cloud.token'
const USER_KEY = 'peekshell.cloud.user'

function readStoredToken(): string {
    try {
        return localStorage.getItem(TOKEN_KEY) ?? ''
    } catch {
        return ''
    }
}

function readStoredUser(): UserProfile | null {
    try {
        const raw = localStorage.getItem(USER_KEY)
        if (!raw) return null
        return parseUserProfile(JSON.parse(raw))
    } catch {
        return null
    }
}

function persistSession(token: string, user: UserProfile) {
    try {
        localStorage.setItem(TOKEN_KEY, token)
        localStorage.setItem(USER_KEY, JSON.stringify(user))
    } catch {
        // ignore quota / private mode
    }
}

function clearPersistedSession() {
    try {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
    } catch {
        // ignore
    }
}

export const useAccountStore = defineStore('account', () => {
    const storedToken = readStoredToken()
    const token = ref(storedToken)
    const user = ref<UserProfile | null>(storedToken ? readStoredUser() : null)

    const isLoggedIn = computed(() => user.value !== null && !!token.value)

    function applySession(nextToken: string, nextUser: UserProfile) {
        token.value = nextToken
        user.value = nextUser
        persistSession(nextToken, nextUser)
    }

    function clearSession() {
        token.value = ''
        user.value = null
        clearPersistedSession()
    }

    async function register(email: string, password: string, nickname?: string) {
        const session = await cloud.register(email, password, nickname)
        applySession(session.token, session.user)
        try {
            await cloudSync.runInitialSync(session.token, session.user.id, password)
        } catch {
            // Session is valid; sync error is shown in User Center.
        }
    }

    async function login(email: string, password: string) {
        const session = await cloud.login(email, password)
        applySession(session.token, session.user)
        try {
            await cloudSync.runInitialSync(session.token, session.user.id, password)
        } catch {
            // Session is valid; sync error is shown in User Center.
        }
    }

    async function logout() {
        const current = token.value
        await cloudSync.stopSync()
        clearSession()
        if (!current) return
        try {
            await cloud.logout(current)
        } catch {
            // Local sign-out still succeeds if the server is unreachable.
        }
    }

    /** Revalidate a persisted token with `/auth/me`. Network errors keep the cache. */
    async function restore() {
        const current = token.value || readStoredToken()
        if (!current) {
            clearSession()
            return
        }
        if (!token.value) token.value = current
        if (!user.value) user.value = readStoredUser()
        try {
            const me = await cloud.getMe(current)
            applySession(current, me)
        } catch (e) {
            if (e instanceof cloud.CloudApiError && e.code === 'unauthorized') {
                await cloudSync.stopSync()
                clearSession()
                return
            }
        }
        if (token.value && user.value) {
            await cloudSync.runRestoreSync(token.value, user.value.id)
        }
    }

    return {
        user,
        isLoggedIn,
        register,
        login,
        logout,
        restore,
    }
})
