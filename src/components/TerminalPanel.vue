<script setup lang="ts">
/**
 * 多标签 xterm：每个会话一个 Terminal 实例，按 activeSessionId 切换显示。
 * 右键菜单区分选区 / 空白；支持查找与终端偏好（字体、配色、背景）。
 */
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import * as api from '../api/tauri'
import { useI18n } from '../i18n'
import { useSessionsStore } from '../stores/sessions'
import { matchShortcut, useTerminalPrefsStore, clampFontSize } from '../stores/terminalPrefs'
import { useUiStore } from '../stores/ui'
import QuickCommandsPanel from './QuickCommandsPanel.vue'
import RemoteExplorer from './RemoteExplorer.vue'

type TermEntry = {
    term: Terminal
    fit: FitAddon
    search: SearchAddon
    unlisten: UnlistenFn
}

type CtxMenuState = {
    x: number
    y: number
    hasSelection: boolean
}

const sessions = useSessionsStore()
const ui = useUiStore()
const termPrefsStore = useTerminalPrefsStore()
const { t } = useI18n()
const { sessions: sessionList, activeSessionId } = storeToRefs(sessions)
const { theme, displayPrefs } = storeToRefs(ui)
const { prefs: termPrefs } = storeToRefs(termPrefsStore)

const hostEl = ref<HTMLElement | null>(null)
const findInputEl = ref<HTMLInputElement | null>(null)
const terms = new Map<string, TermEntry>()
const quickCommandsOpen = ref(false)
const ctxMenu = ref<CtxMenuState | null>(null)
const findOpen = ref(false)
const findQuery = ref('')

const hostSurfaceStyle = computed(() => {
    // Track UI theme so "follow theme" surfaces refresh with --term-bg.
    void theme.value
    const scheme = termPrefs.value.colorScheme
    const img = termPrefs.value.backgroundImage.trim()
    // Prefer CSS var when following UI theme so host stays in sync without a stale hex snapshot.
    const themeBg = img
        ? 'rgba(0, 0, 0, 0)'
        : scheme === 'theme'
          ? 'var(--term-bg)'
          : readTermTheme().background
    const style: Record<string, string> = {
        // Keep host / viewport in sync with xterm-scrollable-element (theme.background).
        backgroundColor: themeBg,
        '--term-surface-bg': themeBg,
    }
    if (!img) return style
    const safe = img.replace(/\\/g, '/').replace(/"/g, '\\"')
    style.backgroundImage = `url("${safe}")`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
    return style
})

const hostOverlayStyle = computed(() => {
    const img = termPrefs.value.backgroundImage.trim()
    if (!img) return undefined
    // Dim the image slightly for text contrast; higher opacity = more visible image.
    const dim = Math.min(
        0.85,
        Math.max(0, 1 - termPrefs.value.backgroundOpacity)
    )
    return { backgroundColor: `rgba(10, 13, 16, ${dim})` }
})

function themeColorsFromCss() {
    const styles = getComputedStyle(document.documentElement)
    const isLight =
        document.documentElement.getAttribute('data-theme') === 'light'
    return {
        background: styles.getPropertyValue('--term-bg').trim() || '#0a0d10',
        foreground: styles.getPropertyValue('--term-fg').trim() || '#d6dde6',
        cursor: styles.getPropertyValue('--accent').trim() || '#3ecf8e',
        selectionBackground: isLight
            ? 'rgba(31, 157, 99, 0.38)'
            : 'rgba(62, 207, 142, 0.4)',
        selectionInactiveBackground: isLight
            ? 'rgba(31, 157, 99, 0.22)'
            : 'rgba(62, 207, 142, 0.22)',
    }
}

function readTermTheme() {
    const scheme = termPrefs.value.colorScheme
    const hasBgImage = !!termPrefs.value.backgroundImage.trim()
    let base =
        scheme === 'custom'
            ? {
                  background: termPrefs.value.customColors.background,
                  foreground: termPrefs.value.customColors.foreground,
                  cursor: termPrefs.value.customColors.cursor,
                  selectionBackground: 'rgba(62, 207, 142, 0.4)',
                  selectionInactiveBackground: 'rgba(62, 207, 142, 0.22)',
              }
            : scheme === 'dark'
            ? {
                  background: '#0a0d10',
                  foreground: '#d6dde6',
                  cursor: '#3ecf8e',
                  selectionBackground: 'rgba(62, 207, 142, 0.4)',
                  selectionInactiveBackground: 'rgba(62, 207, 142, 0.22)',
              }
            : scheme === 'light'
            ? {
                  background: '#fbfcfd',
                  foreground: '#1a2330',
                  cursor: '#1f9d63',
                  selectionBackground: 'rgba(31, 157, 99, 0.38)',
                  selectionInactiveBackground: 'rgba(31, 157, 99, 0.22)',
              }
            : themeColorsFromCss()

    // xterm needs a real transparent color + allowTransparency to show the host background image
    if (hasBgImage) {
        base = { ...base, background: 'rgba(0, 0, 0, 0)' }
    }
    return base
}

function applyTermTheme() {
    const next = readTermTheme()
    const hasBgImage = !!termPrefs.value.backgroundImage.trim()
    for (const [, entry] of terms) {
        entry.term.options.allowTransparency = hasBgImage
        entry.term.options.theme = next
        const root = entry.term.element
        if (root) {
            root.style.backgroundColor = hasBgImage ? 'transparent' : ''
            const viewport = root.querySelector(
                '.xterm-viewport'
            ) as HTMLElement | null
            if (viewport)
                viewport.style.backgroundColor = hasBgImage
                    ? 'transparent'
                    : next.background
            const screen = root.querySelector(
                '.xterm-screen'
            ) as HTMLElement | null
            if (screen)
                screen.style.backgroundColor = hasBgImage ? 'transparent' : ''
        }
        entry.term.refresh(0, entry.term.rows - 1)
    }
}

function applyTermFont() {
    for (const [, entry] of terms) {
        entry.term.options.fontFamily = termPrefs.value.fontFamily
        entry.term.options.fontSize = termPrefs.value.fontSize
        entry.fit.fit()
    }
    if (activeSessionId.value) {
        const active = terms.get(activeSessionId.value)
        if (active) void sessions.resize(active.term.cols, active.term.rows)
    }
}

/** Ctrl/Cmd + / - zoom terminal font (persisted via termPrefs). */
function adjustTermFontSize(delta: number) {
    const next = clampFontSize(termPrefs.value.fontSize + delta)
    if (next === termPrefs.value.fontSize) return
    termPrefs.value.fontSize = next
    applyTermFont()
}

function applyTermPrefs() {
    applyTermTheme()
    applyTermFont()
}

function activeEntry(): TermEntry | null {
    if (!activeSessionId.value) return null
    return terms.get(activeSessionId.value) ?? null
}

async function readClipboardText(): Promise<string> {
    try {
        return await readText()
    } catch {
        try {
            return await navigator.clipboard.readText()
        } catch {
            return ''
        }
    }
}

async function writeClipboardText(text: string) {
    if (!text) return
    try {
        await writeText(text)
    } catch {
        try {
            await navigator.clipboard.writeText(text)
        } catch {
            /* ignore */
        }
    }
}

async function pasteIntoSession(term: Terminal) {
    const text = await readClipboardText()
    if (!text) return
    term.paste(text)
}

function copyTermSelection(term: Terminal): boolean {
    if (!term.hasSelection()) return false
    const selected = term.getSelection()
    if (!selected) return false
    void writeClipboardText(selected)
    return true
}

function clearActiveBuffer() {
    const entry = activeEntry()
    if (!entry) return
    entry.term.clear()
}

function isTermLightTheme(): boolean {
    const scheme = termPrefs.value.colorScheme
    if (scheme === 'light') return true
    if (scheme === 'dark') return false
    if (scheme === 'custom') {
        const bg = termPrefs.value.customColors.background.trim()
        // Rough luminance so custom dark backgrounds still get high-contrast finds
        const hex = /^#([0-9a-f]{6})$/i.exec(bg)
        if (hex) {
            const n = parseInt(hex[1], 16)
            const r = (n >> 16) & 0xff
            const g = (n >> 8) & 0xff
            const b = n & 0xff
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55
        }
        return false
    }
    return document.documentElement.getAttribute('data-theme') === 'light'
}

/** xterm search decorations require opaque #RRGGBB backgrounds; amber reads clearly on dark terminals. */
function searchDecorations() {
    if (isTermLightTheme()) {
        return {
            matchBackground: '#f0d78c',
            matchBorder: '#c4841d',
            matchOverviewRuler: '#c4841d',
            activeMatchBackground: '#e6a23c',
            activeMatchBorder: '#8a5a00',
            activeMatchColorOverviewRuler: '#8a5a00',
        }
    }
    return {
        matchBackground: '#6b5420',
        matchBorder: '#e6a23c',
        matchOverviewRuler: '#e6a23c',
        activeMatchBackground: '#e6a23c',
        activeMatchBorder: '#ffd28a',
        activeMatchColorOverviewRuler: '#ffd28a',
    }
}

function searchOptions() {
    return { decorations: searchDecorations() }
}

function openFind(seed = '') {
    findOpen.value = true
    if (seed) findQuery.value = seed
    void nextTick(() => findInputEl.value?.focus())
    if (findQuery.value) findNext()
}

function closeFind() {
    findOpen.value = false
    const entry = activeEntry()
    entry?.search.clearDecorations()
}

function findNext() {
    const entry = activeEntry()
    if (!entry || !findQuery.value) return
    entry.search.findNext(findQuery.value, searchOptions())
}

function findPrev() {
    const entry = activeEntry()
    if (!entry || !findQuery.value) return
    entry.search.findPrevious(findQuery.value, searchOptions())
}

function closeCtxMenu() {
    ctxMenu.value = null
}

function onTermContextMenu(ev: MouseEvent) {
    if (!activeSessionId.value) return
    ev.preventDefault()
    ev.stopPropagation()
    const entry = activeEntry()
    const hasSelection =
        !!entry?.term.hasSelection() && !!entry.term.getSelection()
    const pad = 8
    const menuW = 180
    const menuH = hasSelection ? 180 : 120
    const x = Math.min(ev.clientX, window.innerWidth - menuW - pad)
    const y = Math.min(ev.clientY, window.innerHeight - menuH - pad)
    ctxMenu.value = { x: Math.max(pad, x), y: Math.max(pad, y), hasSelection }
}

function ctxCopy() {
    const entry = activeEntry()
    if (entry) copyTermSelection(entry.term)
    closeCtxMenu()
}

function ctxPaste() {
    const entry = activeEntry()
    if (entry) void pasteIntoSession(entry.term)
    closeCtxMenu()
}

function ctxFind() {
    const entry = activeEntry()
    const seed = entry?.term.hasSelection() ? entry.term.getSelection() : ''
    closeCtxMenu()
    openFind(seed.trim())
}

function ctxClear() {
    clearActiveBuffer()
    closeCtxMenu()
}

function ctxMore() {
    closeCtxMenu()
    ui.openTerminalSettingsModal()
}

function onGlobalPointerDown(ev: PointerEvent) {
    const target = ev.target as HTMLElement | null
    if (ctxMenu.value && !target?.closest?.('.term-ctx-menu')) {
        closeCtxMenu()
    }
}

async function ensureTerm(sessionId: string) {
    if (terms.has(sessionId) || !hostEl.value) return

    const term = new Terminal({
        cursorBlink: true,
        fontFamily: termPrefs.value.fontFamily,
        fontSize: termPrefs.value.fontSize,
        theme: readTermTheme(),
        // Required for theme.background rgba(0,0,0,0) so the host background image shows through
        allowTransparency: !!termPrefs.value.backgroundImage.trim(),
        // SearchAddon decorations use registerDecoration (still proposed in xterm 6)
        allowProposedApi: true,
        // 避免右键自动选词，以便区分「选区菜单」与「空白菜单」
        rightClickSelectsWord: false,
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(hostEl.value)
    fit.fit()

    // macOS WebKit otherwise shows system autocomplete / autocorrect on the hidden textarea
    const ta = term.textarea
    if (ta) {
        ta.setAttribute('autocomplete', 'off')
        ta.setAttribute('autocorrect', 'off')
        ta.setAttribute('autocapitalize', 'off')
        ta.setAttribute('spellcheck', 'false')
    }

    // Track the current input line so local "cls" can clear the buffer without running remotely.
    let lineBuf = ''
    term.onData((data) => {
        if (data === '\r' || data === '\n' || data === '\r\n') {
            if (lineBuf.trim().toLowerCase() === 'cls') {
                lineBuf = ''
                // Kill the remote input line (echoed "cls") without executing a command.
                void api.ptyWrite(sessionId, '\x15')
                term.clear()
                return
            }
            lineBuf = ''
            void api.ptyWrite(sessionId, data)
            return
        }

        if (data === '\x7f' || data === '\b') {
            lineBuf = lineBuf.slice(0, -1)
        } else if (data === '\x03' || data === '\x15') {
            lineBuf = ''
        } else if (data.length === 1 && data >= ' ') {
            lineBuf += data
        } else if ([...data].every((c) => c >= ' ' || c === '\t')) {
            lineBuf += data
        } else {
            // CSI / other controls (arrows, etc.) — reset local line tracking.
            lineBuf = ''
        }

        void api.ptyWrite(sessionId, data)
    })

    let ignoreNativePasteUntil = 0
    const onNativePaste = (ev: Event) => {
        if (performance.now() < ignoreNativePasteUntil) {
            ev.preventDefault()
            ev.stopPropagation()
        }
    }
    term.textarea?.addEventListener('paste', onNativePaste, true)
    term.element?.addEventListener('paste', onNativePaste, true)

    const onNativeCopy = (ev: Event) => {
        if (!term.hasSelection()) return
        ev.preventDefault()
        ev.stopPropagation()
        copyTermSelection(term)
    }
    term.element?.addEventListener('copy', onNativeCopy, true)
    term.textarea?.addEventListener('copy', onNativeCopy, true)

    term.attachCustomKeyEventHandler((ev) => {
        if (ev.type !== 'keydown') return true
        const shortcuts = termPrefs.value.shortcuts

        if (matchShortcut(ev, shortcuts.paste)) {
            ev.preventDefault()
            ev.stopPropagation()
            ignoreNativePasteUntil = performance.now() + 500
            void pasteIntoSession(term)
            return false
        }
        if (matchShortcut(ev, shortcuts.copy)) {
            if (copyTermSelection(term)) {
                ev.preventDefault()
                ev.stopPropagation()
                return false
            }
        }
        if (matchShortcut(ev, shortcuts.find)) {
            ev.preventDefault()
            ev.stopPropagation()
            openFind(
                term.hasSelection() ? term.getSelection() : findQuery.value
            )
            return false
        }
        if (matchShortcut(ev, shortcuts.clear)) {
            ev.preventDefault()
            ev.stopPropagation()
            term.clear()
            return false
        }
        // Tab management: consume so shell does not see Ctrl+N / Ctrl+W
        if (
            matchShortcut(ev, shortcuts.newSession) ||
            matchShortcut(ev, shortcuts.closeTab)
        ) {
            return false
        }
        // Ctrl/Cmd + / - ：放大 / 缩小终端字号（= 与 + 均可放大）
        if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
            if (
                ev.key === '=' ||
                ev.key === '+' ||
                ev.code === 'NumpadAdd'
            ) {
                ev.preventDefault()
                ev.stopPropagation()
                adjustTermFontSize(1)
                return false
            }
            if (
                (ev.key === '-' || ev.code === 'NumpadSubtract') &&
                !ev.shiftKey
            ) {
                ev.preventDefault()
                ev.stopPropagation()
                adjustTermFontSize(-1)
                return false
            }
        }
        // 兼容：有选区时 Ctrl/Cmd+C 仍可复制
        if (
            (ev.ctrlKey || ev.metaKey) &&
            !ev.altKey &&
            !ev.shiftKey &&
            ev.key.toLowerCase() === 'c'
        ) {
            if (copyTermSelection(term)) {
                ev.preventDefault()
                ev.stopPropagation()
                return false
            }
        }
        return true
    })

    const unlisten = await listen<string>(`pty://${sessionId}`, (event) => {
        term.write(event.payload)
    })

    terms.set(sessionId, { term, fit, search, unlisten })
    showOnly(sessionId)
    void sessions.resize(term.cols, term.rows)
}

function showOnly(sessionId: string) {
    for (const [id, entry] of terms) {
        entry.term.element!.style.display = id === sessionId ? 'block' : 'none'
    }
    const active = terms.get(sessionId)
    if (active) {
        active.fit.fit()
        active.term.focus()
        void sessions.resize(active.term.cols, active.term.rows)
    }
}

async function onSelect(sessionId: string) {
    sessions.select(sessionId)
    await ensureTerm(sessionId)
    showOnly(sessionId)
}

async function onClose(sessionId: string, ev?: Event) {
    ev?.stopPropagation()
    const entry = terms.get(sessionId)
    if (entry) {
        entry.unlisten()
        entry.term.dispose()
        terms.delete(sessionId)
    }
    await sessions.close(sessionId)
}

/** Duplicate the active session onto the same host (Ctrl+N). */
async function duplicateActiveSession() {
    const session = sessions.activeSession
    if (!session || sessions.connecting) return
    try {
        await sessions.connect(session.hostId)
    } catch {
        // sessions store already records error
    }
}

async function closeActiveTab() {
    const id = activeSessionId.value
    if (!id) return
    await onClose(id)
}

/** Skip tab shortcuts while typing in forms; xterm is handled separately. */
function isFormTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    if (target.closest('.xterm')) return false
    if (target.isContentEditable) return true
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function onTabShortcutKeydown(ev: KeyboardEvent) {
    if (isFormTypingTarget(ev.target)) return
    const shortcuts = termPrefs.value.shortcuts
    if (matchShortcut(ev, shortcuts.newSession)) {
        ev.preventDefault()
        void duplicateActiveSession()
        return
    }
    if (matchShortcut(ev, shortcuts.closeTab)) {
        ev.preventDefault()
        void closeActiveTab()
    }
}

function onResize() {
    scheduleTermFit()
}

let fitRaf = 0
/** Fit after layout settles — explorer height emits before Vue paints the new flex size. */
function scheduleTermFit() {
    if (fitRaf) cancelAnimationFrame(fitRaf)
    fitRaf = requestAnimationFrame(() => {
        fitRaf = 0
        void nextTick(() => {
            if (!activeSessionId.value) return
            const entry = terms.get(activeSessionId.value)
            if (!entry?.term.element) return
            entry.fit.fit()
            void sessions.resize(entry.term.cols, entry.term.rows)
        })
    })
}

watch(
    () => sessionList.value.map((s) => s.sessionId).join(','),
    async () => {
        for (const s of sessionList.value) {
            await ensureTerm(s.sessionId)
        }
        if (activeSessionId.value) showOnly(activeSessionId.value)
    }
)

watch(theme, async () => {
    // Wait for data-theme / CSS vars, then sync xterm + host surface.
    await nextTick()
    applyTermTheme()
})

watch(
    termPrefs,
    () => {
        applyTermPrefs()
    },
    { deep: true }
)

watch(
    () => displayPrefs.value.explorer.show,
    async () => {
        await nextTick()
        onResize()
    }
)

let hostResizeObserver: ResizeObserver | null = null

onMounted(async () => {
    window.addEventListener('resize', onResize)
    window.addEventListener('pointerdown', onGlobalPointerDown, true)
    window.addEventListener('keydown', onTabShortcutKeydown, true)
    await nextTick()
    if (hostEl.value && typeof ResizeObserver !== 'undefined') {
        hostResizeObserver = new ResizeObserver(() => scheduleTermFit())
        hostResizeObserver.observe(hostEl.value)
    }
    for (const s of sessionList.value) {
        await ensureTerm(s.sessionId)
    }
})

onBeforeUnmount(() => {
    if (fitRaf) cancelAnimationFrame(fitRaf)
    fitRaf = 0
    hostResizeObserver?.disconnect()
    hostResizeObserver = null
    window.removeEventListener('resize', onResize)
    window.removeEventListener('pointerdown', onGlobalPointerDown, true)
    window.removeEventListener('keydown', onTabShortcutKeydown, true)
    for (const [, entry] of terms) {
        entry.unlisten()
        entry.term.dispose()
    }
    terms.clear()
})
</script>

<template>
    <section class="main">
        <div class="tabs">
            <template v-for="s in sessionList" :key="s.sessionId">
                <button
                    type="button"
                    class="tab"
                    :class="{ active: s.sessionId === activeSessionId }"
                    @click="onSelect(s.sessionId)"
                >
                    <span class="dot" />
                    <span>{{ s.title }}</span>
                    <span class="x" @click="onClose(s.sessionId, $event)">×</span>
                </button>
                <button
                    v-if="s.sessionId === activeSessionId"
                    type="button"
                    class="tab-tool tab-add"
                    :title="t('terminal.openFromHosts')"
                    @click="ui.openHostsModal()"
                >
                    ＋
                </button>
            </template>
            <button
                v-if="!sessionList.length"
                type="button"
                class="tab-tool tab-add"
                :title="t('terminal.openFromHosts')"
                @click="ui.openHostsModal()"
            >
                ＋
            </button>
            <span class="tabs-spacer" />
            <div class="tabs-tools">
                <button
                    type="button"
                    class="tab-tool quick-commands-btn"
                    :class="{ active: quickCommandsOpen }"
                    :title="t('quickCommands.title')"
                    :aria-label="t('quickCommands.title')"
                    :aria-expanded="quickCommandsOpen"
                    @click="quickCommandsOpen = !quickCommandsOpen"
                >
                    <svg
                        viewBox="0 0 16 16"
                        width="14"
                        height="14"
                        aria-hidden="true"
                    >
                        <path
                            d="M3 4.5 6.5 8 3 11.5M8 11.5h5"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.6"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </button>
                <QuickCommandsPanel v-model:open="quickCommandsOpen" />
            </div>
        </div>

        <div
            ref="hostEl"
            class="term-host"
            :class="{ 'has-bg-image': !!termPrefs.backgroundImage.trim() }"
            :style="hostSurfaceStyle"
            @contextmenu="onTermContextMenu"
        >
            <div
                v-if="termPrefs.backgroundImage.trim()"
                class="term-bg-overlay"
                :style="hostOverlayStyle"
            />
            <div
                v-if="findOpen"
                class="term-find"
                @mousedown.stop
                @contextmenu.stop
            >
                <input
                    ref="findInputEl"
                    v-model="findQuery"
                    type="text"
                    class="term-find-input"
                    :placeholder="t('terminal.findPlaceholder')"
                    @keydown.enter.exact.prevent="findNext"
                    @keydown.enter.shift.prevent="findPrev"
                    @keydown.esc.prevent="closeFind"
                />
                <button
                    type="button"
                    class="term-find-btn"
                    :title="t('terminal.findPrev')"
                    @click="findPrev"
                >
                    ↑
                </button>
                <button
                    type="button"
                    class="term-find-btn"
                    :title="t('terminal.findNext')"
                    @click="findNext"
                >
                    ↓
                </button>
                <button
                    type="button"
                    class="term-find-btn"
                    :title="t('terminal.findClose')"
                    @click="closeFind"
                >
                    ✕
                </button>
            </div>
            <div v-if="!sessionList.length" class="empty">
                {{ t('terminal.empty') }}
            </div>
        </div>

        <RemoteExplorer v-if="displayPrefs.explorer.show" @resized="onResize" />

        <Teleport to="body">
            <div
                v-if="ctxMenu"
                class="term-ctx-menu"
                :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
                @contextmenu.prevent
            >
                <template v-if="ctxMenu.hasSelection">
                    <button type="button" class="ctx-item" @click="ctxCopy">
                        {{ t('terminal.ctxCopy') }}
                    </button>
                    <button type="button" class="ctx-item" @click="ctxPaste">
                        {{ t('terminal.ctxPaste') }}
                    </button>
                    <div class="ctx-sep" />
                </template>
                <button type="button" class="ctx-item" @click="ctxFind">
                    {{ t('terminal.ctxFind') }}
                </button>
                <button type="button" class="ctx-item" @click="ctxClear">
                    {{ t('terminal.ctxClear') }}
                </button>
                <div class="ctx-sep" />
                <button type="button" class="ctx-item" @click="ctxMore">
                    {{ t('terminal.ctxMore') }}
                </button>
            </div>
        </Teleport>
    </section>
</template>

<style scoped>
.main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    background: var(--term-bg);
}

.tabs {
    height: 32px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-soft);
    display: flex;
    align-items: stretch;
    padding: 0 2px;
    gap: 1px;
    position: relative;
}

.tabs-spacer {
    flex: 1;
    min-width: 8px;
}

.tabs-tools {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px 0 2px;
    flex-shrink: 0;
}

.tab-tool {
    width: 28px;
    height: 26px;
    margin-top: 2px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-dim);
    font-size: 16px;
    display: grid;
    place-items: center;
}

.tab-tool:hover {
    background: var(--bg-hover);
    color: var(--text);
}

.tab-tool.active {
    color: var(--accent);
    background: var(--accent-dim);
}

.tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    font-size: 12px;
    color: var(--text-muted);
    border: none;
    background: transparent;
    border-radius: 6px 6px 0 0;
    margin-top: 2px;
    max-width: 180px;
}

.tab.active {
    background: var(--term-bg);
    color: var(--text);
    border: 1px solid var(--border-soft);
    border-bottom-color: var(--term-bg);
}

.dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
}

.x {
    margin-left: 4px;
    opacity: 0.5;
}
.x:hover {
    opacity: 1;
    color: var(--danger);
}

.term-host {
    flex: 1;
    min-height: 0;
    padding: 4px;
    position: relative;
    overflow: hidden;
    /* Match xterm-scrollable-element theme.background (set via --term-surface-bg). */
    background-color: var(--term-surface-bg, var(--term-bg));
}

.term-host.has-bg-image {
    background-color: transparent;
}

.term-bg-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
}

.term-host :deep(.xterm) {
    height: 100%;
    max-height: 100%;
    position: relative;
    z-index: 1;
    overflow: hidden;
}

.term-host :deep(.xterm-viewport) {
    overflow-y: auto !important;
    /* Same as xterm-scrollable-element on macOS (theme.background). */
    background-color: var(--term-surface-bg, var(--term-bg)) !important;
}

.term-host :deep(.xterm-scrollable-element) {
    /* Prevent Mac overlay scrollbar host from spilling past term-host during explorer resize. */
    max-height: 100% !important;
}

.term-host.has-bg-image :deep(.xterm),
.term-host.has-bg-image :deep(.xterm-viewport),
.term-host.has-bg-image :deep(.xterm-screen),
.term-host.has-bg-image :deep(.xterm-helpers),
.term-host.has-bg-image :deep(canvas) {
    background-color: transparent !important;
}

.term-host :deep(.xterm-scrollable-element > .scrollbar.vertical) {
    width: 6px !important;
    right: 0 !important;
}
.term-host :deep(.xterm-scrollable-element > .scrollbar.vertical > .slider) {
    width: 6px !important;
    left: 0 !important;
    border-radius: 999px;
    background: var(--scrollbar-thumb) !important;
}
.term-host
    :deep(.xterm-scrollable-element > .scrollbar.vertical > .slider:hover) {
    background: var(--scrollbar-thumb-hover) !important;
}

.term-find {
    position: absolute;
    top: 8px;
    right: 12px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.term-find-input {
    width: 180px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border-soft);
    border-radius: 6px;
    background: var(--bg-root);
    color: var(--text);
    font-size: 12px;
    outline: none;
}

.term-find-input:focus {
    border-color: var(--accent-border);
}

.term-find-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
}

.term-find-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
}

.empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    font-size: 13px;
    padding: 24px;
    text-align: center;
    z-index: 1;
}
</style>

<style>
/* Teleport 到 body，不能用 scoped */
.term-ctx-menu {
    position: fixed;
    z-index: 100;
    min-width: 168px;
    padding: 6px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.term-ctx-menu .ctx-item {
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
}

.term-ctx-menu .ctx-item:hover {
    background: var(--bg-hover);
}

.term-ctx-menu .ctx-sep {
    height: 1px;
    margin: 4px 2px;
    background: var(--border-soft);
}
</style>
