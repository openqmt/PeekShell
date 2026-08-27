/**
 * Cloud account session for User Center.
 * UI-only mock until PeekServer auth is wired; state lives in memory for this launch.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { UserProfile } from '../types/account'

function emailPrefix(email: string): string {
    const local = email.split('@')[0] ?? ''
    return local.slice(0, 32) || 'user'
}

function mockProfile(email: string, nickname?: string): UserProfile {
    const now = Date.now()
    return {
        id: crypto.randomUUID(),
        email,
        nickname: nickname || emailPrefix(email),
        points: 0,
        role: 'user',
        createdAt: now,
        updatedAt: now,
    }
}

export const useAccountStore = defineStore('account', () => {
    const user = ref<UserProfile | null>(null)
    const isLoggedIn = computed(() => user.value !== null)

    function register(email: string, _password: string, nickname?: string) {
        user.value = mockProfile(email, nickname)
    }

    function login(email: string, _password: string) {
        user.value = mockProfile(email)
    }

    function logout() {
        user.value = null
    }

    return {
        user,
        isLoggedIn,
        register,
        login,
        logout,
    }
})
