/**
 * Snapshot / apply each sync collection against local stores and JSON files.
 * `secrets_enc` is handled in the client (vault stays in Rust).
 */
import * as api from '../api/tauri'
import { UNGROUPED_GROUP, type Locale } from '../i18n/messages'
import {
    clampEditorFontSize,
    useEditorPrefsStore,
    type EditorColorScheme,
} from '../stores/editorPrefs'
import {
    clampPreviewMaxKb,
    useExplorerPrefsStore,
    type ExplorerKindDisplay,
} from '../stores/explorerPrefs'
import { useQuickCommandsStore } from '../stores/quickCommands'
import {
    clampFontSize,
    useTerminalPrefsStore,
    type TermColorScheme,
} from '../stores/terminalPrefs'
import {
    clampUiScale,
    normalizeAccentColor,
    useUiStore,
    type ThemeMode,
} from '../stores/ui'
import type { QuickCommand } from '../types/quickCommand'
import type { SyncCollection } from '../types/sync'

function cloneObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string')
}

/** Custom wallpapers stay local until R2 upload is wired; only portable refs go to the cloud. */
function portableBackground(src: string): string {
    const value = src.trim()
    if (value.startsWith('preset:') || value.startsWith('r2:')) return value
    return ''
}

export async function snapshotCollection(
    collection: Exclude<SyncCollection, 'secrets_enc'>,
): Promise<Record<string, unknown>> {
    if (collection === 'hosts') return cloneObject(await api.exportHostsSync())
    if (collection === 'models') return cloneObject(await api.exportModelsSync())
    if (collection === 'display') {
        const ui = useUiStore()
        const editor = useEditorPrefsStore()
        const explorer = useExplorerPrefsStore()
        return {
            theme: ui.theme,
            locale: ui.locale,
            displayPrefs: cloneObject(ui.displayPrefs),
            aiPanelWidth: ui.aiPanelWidth,
            sidebarWidth: ui.sidebarWidth,
            editorPrefs: cloneObject(editor.prefs),
            explorerPrefs: cloneObject(explorer.prefs),
        }
    }
    if (collection === 'terminal') {
        const { prefs } = useTerminalPrefsStore()
        const cloned = cloneObject(prefs)
        cloned.backgroundImage = portableBackground(prefs.backgroundImage)
        cloned.customBackgroundImages = prefs.customBackgroundImages
            .map(portableBackground)
            .filter(Boolean)
        return cloned
    }
    const qc = useQuickCommandsStore()
    return {
        groups: [...qc.groups],
        commands: JSON.parse(JSON.stringify(qc.commands)) as QuickCommand[],
    }
}

export async function applyCollection(
    collection: Exclude<SyncCollection, 'secrets_enc'>,
    payload: Record<string, unknown>,
): Promise<void> {
    if (collection === 'hosts') {
        await api.importHostsSync(payload)
        return
    }
    if (collection === 'models') {
        await api.importModelsSync(payload)
        return
    }
    if (collection === 'display') {
        applyDisplay(payload)
        return
    }
    if (collection === 'terminal') {
        applyTerminal(payload)
        return
    }
    applyQuickCommands(payload)
}

function applyDisplay(payload: Record<string, unknown>) {
    const ui = useUiStore()
    if (payload.theme === 'dark' || payload.theme === 'light') {
        ui.setTheme(payload.theme as ThemeMode)
    }
    if (payload.locale === 'en' || payload.locale === 'zh') {
        ui.setLocale(payload.locale as Locale)
    }
    const prefs = asObject(payload.displayPrefs)
    if (prefs) {
        const sidebar = asObject(prefs.sidebar)
        if (sidebar) {
            for (const key of ['system', 'resources', 'processes', 'network'] as const) {
                if (typeof sidebar[key] === 'boolean') {
                    ui.displayPrefs.sidebar[key] = sidebar[key]
                }
            }
        }
        const explorer = asObject(prefs.explorer)
        if (explorer) {
            for (const key of [
                'show',
                'colName',
                'colSize',
                'colType',
                'colModified',
                'colPermissions',
                'colGroup',
            ] as const) {
                if (typeof explorer[key] === 'boolean') {
                    ui.displayPrefs.explorer[key] = explorer[key]
                }
            }
        }
        if (typeof prefs.aiPanel === 'boolean') ui.displayPrefs.aiPanel = prefs.aiPanel
        ui.displayPrefs.accentColor = normalizeAccentColor(prefs.accentColor)
        if (typeof prefs.uiScale === 'number') {
            ui.displayPrefs.uiScale = clampUiScale(prefs.uiScale)
        }
    }
    if (typeof payload.aiPanelWidth === 'number') {
        ui.setAiPanelWidth(payload.aiPanelWidth)
    }
    if (typeof payload.sidebarWidth === 'number') {
        ui.setSidebarWidth(payload.sidebarWidth)
    }

    const editorPayload = asObject(payload.editorPrefs)
    if (editorPayload) {
        const editor = useEditorPrefsStore()
        const scheme = editorPayload.colorScheme
        if (scheme === 'theme' || scheme === 'dark' || scheme === 'light') {
            editor.prefs.colorScheme = scheme as EditorColorScheme
        }
        if (typeof editorPayload.fontFamily === 'string' && editorPayload.fontFamily.trim()) {
            editor.prefs.fontFamily = editorPayload.fontFamily
        }
        if (typeof editorPayload.fontSize === 'number') {
            editor.prefs.fontSize = clampEditorFontSize(editorPayload.fontSize)
        }
    }

    const explorerPayload = asObject(payload.explorerPrefs)
    if (explorerPayload) {
        const explorer = useExplorerPrefsStore()
        if (typeof explorerPayload.previewMaxKb === 'number') {
            explorer.prefs.previewMaxKb = clampPreviewMaxKb(explorerPayload.previewMaxKb)
        }
        const kind = explorerPayload.kindDisplay
        if (kind === 'text' || kind === 'icon' || kind === 'windows' || kind === 'macos') {
            explorer.prefs.kindDisplay = kind as ExplorerKindDisplay
        }
    }
}

function applyTerminal(payload: Record<string, unknown>) {
    const { prefs } = useTerminalPrefsStore()
    if (typeof payload.fontFamily === 'string' && payload.fontFamily.trim()) {
        prefs.fontFamily = payload.fontFamily
    }
    if (typeof payload.fontSize === 'number') {
        prefs.fontSize = clampFontSize(payload.fontSize)
    }
    const scheme = payload.colorScheme
    if (
        scheme === 'theme' ||
        scheme === 'dark' ||
        scheme === 'light' ||
        scheme === 'custom'
    ) {
        prefs.colorScheme = scheme as TermColorScheme
    }
    const colors = asObject(payload.customColors)
    if (colors) {
        for (const key of ['background', 'foreground', 'cursor'] as const) {
            if (typeof colors[key] === 'string' && colors[key]) {
                prefs.customColors[key] = colors[key]
            }
        }
    }
    if (typeof payload.backgroundOpacity === 'number') {
        prefs.backgroundOpacity = Math.min(1, Math.max(0, payload.backgroundOpacity))
    }
    const shortcuts = asObject(payload.shortcuts)
    if (shortcuts) {
        for (const key of [
            'copy',
            'paste',
            'find',
            'clear',
            'newSession',
            'closeTab',
            'aiChat',
        ] as const) {
            if (typeof shortcuts[key] === 'string' && shortcuts[key]) {
                prefs.shortcuts[key] = shortcuts[key]
            }
        }
    }
    if (typeof payload.backgroundImage === 'string') {
        const next = portableBackground(payload.backgroundImage)
        if (next) prefs.backgroundImage = next
    }
    const remoteCustom = asStringArray(payload.customBackgroundImages)
        .map(portableBackground)
        .filter(Boolean)
    if (remoteCustom.length) {
        prefs.customBackgroundImages = remoteCustom
    }
}

function applyQuickCommands(payload: Record<string, unknown>) {
    const qc = useQuickCommandsStore()
    const commands: QuickCommand[] = []
    if (Array.isArray(payload.commands)) {
        for (const item of payload.commands) {
            const row = asObject(item)
            if (!row) continue
            if (
                typeof row.id !== 'string' ||
                typeof row.name !== 'string' ||
                typeof row.command !== 'string'
            ) {
                continue
            }
            const group =
                typeof row.group === 'string' && row.group.trim()
                    ? row.group.trim()
                    : UNGROUPED_GROUP
            commands.push({
                id: row.id,
                name: row.name,
                command: row.command,
                group,
            })
        }
    }
    const groups = new Set<string>([UNGROUPED_GROUP])
    for (const g of asStringArray(payload.groups)) {
        if (g.trim()) groups.add(g.trim())
    }
    for (const c of commands) groups.add(c.group)
    qc.groups = [...groups]
    qc.commands = commands
}
