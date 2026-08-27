/**
 * Cloud sync status for User Center. The actual pull/push lives in `src/sync/client.ts`.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type CloudSyncErrorCode = '' | 'network' | 'vault' | 'sync'

export const useCloudSyncStore = defineStore('cloudSync', () => {
    const syncing = ref(false)
    const lastSyncedAt = ref<number | null>(null)
    const error = ref<CloudSyncErrorCode>('')

    function setSyncing(value: boolean) {
        syncing.value = value
    }

    function markSynced() {
        lastSyncedAt.value = Date.now()
    }

    function setError(code: CloudSyncErrorCode) {
        error.value = code
    }

    function reset() {
        syncing.value = false
        lastSyncedAt.value = null
        error.value = ''
    }

    return {
        syncing,
        lastSyncedAt,
        error,
        setSyncing,
        markSynced,
        setError,
        reset,
    }
})
