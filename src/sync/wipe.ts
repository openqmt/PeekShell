/**
 * Logout wipe: drop SSH sessions, native JSON files, Pinia state, and peekshell.* keys.
 * Call after `stopSync` so watchers cannot enqueue a PUT of the emptied local copy.
 */
import * as api from '../api/tauri'
import { useAiStore } from '../stores/ai'
import { useEditorPrefsStore } from '../stores/editorPrefs'
import { useExplorerPrefsStore } from '../stores/explorerPrefs'
import { useHostsStore } from '../stores/hosts'
import { useQuickCommandsStore } from '../stores/quickCommands'
import { useSessionsStore } from '../stores/sessions'
import { useTerminalPrefsStore } from '../stores/terminalPrefs'
import { useTransfersStore } from '../stores/transfers'
import { useUiStore } from '../stores/ui'
import { withApplyingRemote } from './queue'

function clearPeekshellStorage() {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('peekshell.')) keys.push(key)
    }
    for (const key of keys) {
        localStorage.removeItem(key)
    }
}

/** Reset local user data to a first-launch empty state. Cloud copies are not deleted. */
export async function wipeLocalUserData() {
    await useSessionsStore().closeAll()
    useTransfersStore().resetLocal()
    try {
        await api.clearLocalUserData()
    } catch {
        // Browser preview has no native store; still reset the frontend.
    }
    await withApplyingRemote(async () => {
        useUiStore().resetLocal()
        useTerminalPrefsStore().reset()
        useEditorPrefsStore().reset()
        useExplorerPrefsStore().reset()
        useQuickCommandsStore().reset()
        useAiStore().resetLocal()
        await Promise.all([useHostsStore().refresh(), useAiStore().refresh()])
    })
    clearPeekshellStorage()
}
