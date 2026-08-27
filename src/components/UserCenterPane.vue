<script setup lang="ts">
/**
 * User Center pane: email login/register when signed out, profile when signed in.
 * Auth goes through PeekServer `/auth/register`, `/auth/login`, `/auth/logout`.
 */
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { CloudApiError } from '../api/cloud'
import { useI18n } from '../i18n'
import { useAccountStore } from '../stores/account'
import type { AccountRole } from '../types/account'

type AuthMode = 'login' | 'register'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NICKNAME_MAX = 32
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

const account = useAccountStore()
const { t, locale } = useI18n()
const { user, isLoggedIn } = storeToRefs(account)

const mode = ref<AuthMode>('login')
const email = ref('')
const password = ref('')
const nickname = ref('')
const error = ref('')
const submitting = ref(false)

watch(mode, () => {
    error.value = ''
    password.value = ''
    nickname.value = ''
})

const avatarLetter = computed(() => {
    const name = user.value?.nickname?.trim() || user.value?.email || '?'
    return name.slice(0, 1).toUpperCase()
})

function roleLabel(role: AccountRole) {
    if (role === 'sponsor') return t('userCenter.roleSponsor')
    if (role === 'admin') return t('userCenter.roleAdmin')
    return t('userCenter.roleUser')
}

function formatJoined(ms: number) {
    return new Date(ms).toLocaleDateString(
        locale.value === 'zh' ? 'zh-CN' : 'en-US',
        { year: 'numeric', month: 'short', day: 'numeric' },
    )
}

function normalizeEmail(raw: string) {
    return raw.trim().toLowerCase()
}

function validateEmail(value: string) {
    if (value.length > 254 || !EMAIL_RE.test(value)) return t('userCenter.errorEmail')
    return ''
}

function validatePassword(value: string) {
    if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
        return t('userCenter.errorPassword')
    }
    return ''
}

function validateNickname(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (trimmed.length > NICKNAME_MAX) return t('userCenter.errorNickname')
    return ''
}

function cloudErrorMessage(e: unknown): string {
    if (e instanceof CloudApiError) {
        if (e.code === 'invalid_credentials') return t('userCenter.errorCredentials')
        if (e.code === 'email_taken') return t('userCenter.errorEmailTaken')
        if (e.code === 'rate_limited') return t('userCenter.errorRateLimited')
        if (e.code === 'invalid_input') return t('userCenter.errorInvalidInput')
        if (e.code === 'network') return t('userCenter.errorNetwork')
    }
    return t('userCenter.errorNetwork')
}

async function submitAuth() {
    if (submitting.value) return
    error.value = ''
    const mail = normalizeEmail(email.value)
    const mailErr = validateEmail(mail)
    if (mailErr) {
        error.value = mailErr
        return
    }
    const passErr = validatePassword(password.value)
    if (passErr) {
        error.value = passErr
        return
    }
    if (mode.value === 'register') {
        const nickErr = validateNickname(nickname.value)
        if (nickErr) {
            error.value = nickErr
            return
        }
    }
    submitting.value = true
    try {
        if (mode.value === 'register') {
            await account.register(
                mail,
                password.value,
                nickname.value.trim() || undefined,
            )
        } else {
            await account.login(mail, password.value)
        }
        password.value = ''
        nickname.value = ''
    } catch (e) {
        error.value = cloudErrorMessage(e)
    } finally {
        submitting.value = false
    }
}

async function signOut() {
    error.value = ''
    password.value = ''
    nickname.value = ''
    await account.logout()
}
</script>

<template>
    <div class="user-pane">
        <template v-if="!isLoggedIn">
            <div class="auth-intro">
                <h2 class="brand-title">PeekShell</h2>
                <p class="hint">{{ t('userCenter.hint') }}</p>
            </div>
            <div class="auth-body">
            <div class="auth-tabs" role="tablist">
                <button
                    type="button"
                    class="auth-tab"
                    role="tab"
                    :class="{ active: mode === 'login' }"
                    :aria-selected="mode === 'login'"
                    :disabled="submitting"
                    @click="mode = 'login'"
                >
                    {{ t('userCenter.loginTitle') }}
                </button>
                <button
                    type="button"
                    class="auth-tab"
                    role="tab"
                    :class="{ active: mode === 'register' }"
                    :aria-selected="mode === 'register'"
                    :disabled="submitting"
                    @click="mode = 'register'"
                >
                    {{ t('userCenter.registerTitle') }}
                </button>
            </div>

            <div v-if="error" class="error-banner">{{ error }}</div>

            <form class="auth-form" @submit.prevent="submitAuth">
                <div class="field">
                    <label
                        >{{ t('userCenter.email')
                        }}<span class="req">*</span></label
                    >
                    <input
                        v-model="email"
                        type="email"
                        autocomplete="email"
                        :placeholder="t('userCenter.emailPlaceholder')"
                        :disabled="submitting"
                    />
                </div>
                <div v-if="mode === 'register'" class="field">
                    <label>{{ t('userCenter.nicknameOptional') }}</label>
                    <input
                        v-model="nickname"
                        type="text"
                        maxlength="32"
                        autocomplete="nickname"
                        :placeholder="t('userCenter.nicknamePlaceholder')"
                        :disabled="submitting"
                    />
                </div>
                <div class="field">
                    <label
                        >{{ t('userCenter.password')
                        }}<span class="req">*</span></label
                    >
                    <input
                        v-model="password"
                        type="password"
                        :autocomplete="
                            mode === 'register'
                                ? 'new-password'
                                : 'current-password'
                        "
                        :placeholder="t('userCenter.passwordPlaceholder')"
                        :disabled="submitting"
                    />
                </div>
                <div class="actions">
                    <button
                        type="submit"
                        class="btn primary md"
                        :disabled="submitting"
                    >
                        {{
                            submitting
                                ? t('common.loading')
                                : mode === 'register'
                                  ? t('userCenter.submitRegister')
                                  : t('userCenter.submitLogin')
                        }}
                    </button>
                </div>
            </form>
            </div>
        </template>

        <template v-else>
            <div class="profile-hero">
                <div class="avatar" aria-hidden="true">{{ avatarLetter }}</div>
                <div class="profile-meta">
                    <div class="profile-name">{{ user?.nickname }}</div>
                    <div class="profile-email">{{ user?.email }}</div>
                </div>
                <button type="button" class="btn danger md" @click="signOut">
                    {{ t('userCenter.logout') }}
                </button>
            </div>

            <div class="info-card">
                <div class="info-row">
                    <span class="info-label">{{ t('userCenter.points') }}</span>
                    <span class="info-value">{{ user?.points ?? 0 }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">{{ t('userCenter.role') }}</span>
                    <span class="info-value">{{
                        user ? roleLabel(user.role) : ''
                    }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">{{
                        t('userCenter.createdAt')
                    }}</span>
                    <span class="info-value">{{
                        user ? formatJoined(user.createdAt) : ''
                    }}</span>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.user-pane {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 100%;
}

.auth-intro {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
}

.brand-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--text);
}

.hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
}

.auth-body {
    width: 100%;
    max-width: 320px;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.auth-tabs {
    display: flex;
    gap: 3px;
    padding: 2px;
    background: var(--bg-root);
    border: 1px solid var(--border);
    border-radius: 6px;
}

.auth-tab {
    flex: 1;
    height: 28px;
    margin: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
}

.auth-tab:disabled {
    cursor: not-allowed;
}

.auth-tab.active {
    background: var(--accent-dim);
    color: var(--accent);
    outline: 1px solid var(--accent-border);
}

.auth-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.actions {
    display: flex;
    justify-content: center;
    margin-top: 2px;
}

.actions .btn {
    min-width: 88px;
}

.actions .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.profile-hero {
    display: flex;
    align-items: center;
    gap: 12px;
}

.profile-hero > .btn {
    flex-shrink: 0;
}

.avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    background: var(--accent-dim);
    color: var(--accent);
    font-size: 18px;
    font-weight: 700;
    user-select: none;
}

.profile-meta {
    min-width: 0;
    flex: 1;
}

.profile-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.profile-email {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.info-card {
    overflow: hidden;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    background: var(--bg-elevated);
}

.info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-soft);
}

.info-row:last-child {
    border-bottom: none;
}

.info-label {
    font-size: 12px;
    color: var(--text-muted);
}

.info-value {
    font-size: 12px;
    color: var(--text);
    text-align: right;
}
</style>
