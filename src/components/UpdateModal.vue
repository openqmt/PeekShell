<script setup lang="ts">
/**
 * Upgrade prompt driven by updater store.
 * `force` hides cancel / backdrop dismiss; shows download progress while installing.
 */
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { useUpdaterStore } from '../stores/updater'

const updater = useUpdaterStore()
const { t, locale } = useI18n()
const {
    modalOpen,
    force,
    notesZh,
    notesEn,
    installing,
    progressPercent,
    error,
} = storeToRefs(updater)

const notes = computed(() => {
    const text = (locale.value === 'zh' ? notesZh.value : notesEn.value).trim()
    return text
})

const progressLabel = computed(() => {
    if (!installing.value) return ''
    const pct = progressPercent.value ? `${progressPercent.value}%` : ''
    return pct
        ? `${t('updateModal.progress')}\n${pct}`
        : t('updateModal.progress')
})

function onBackdrop(e: MouseEvent) {
    if (e.target !== e.currentTarget) return
    updater.dismiss()
}
</script>

<template>
    <div v-if="modalOpen" class="overlay overlay-top" @click="onBackdrop">
        <div
            class="modal sm update-modal"
            role="dialog"
            aria-labelledby="updateModalTitle"
        >
            <div class="modal-head update-head">
                <h2 id="updateModalTitle">{{ t('updateModal.title') }}</h2>
                <button
                    v-if="!force && !installing"
                    type="button"
                    class="icon-btn update-close"
                    :aria-label="t('common.close')"
                    @click="updater.dismiss()"
                >
                    ✕
                </button>
            </div>
            <div class="modal-body update-body">
                <p v-if="notes" class="update-notes">{{ notes }}</p>
                <p v-if="installing" class="update-progress">
                    {{ progressLabel }}
                </p>
                <p v-if="error" class="update-error">
                    {{ t('updateModal.error') }}
                </p>
            </div>
            <div class="modal-foot update-foot">
                <button
                    v-if="!force && !installing"
                    type="button"
                    class="btn md"
                    @click="updater.dismiss()"
                >
                    {{ t('common.cancel') }}
                </button>
                <button
                    type="button"
                    class="btn primary md"
                    :disabled="installing"
                    @click="updater.upgrade()"
                >
                    {{
                        installing
                            ? t('updateModal.upgrading')
                            : t('updateModal.upgrade')
                    }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.update-head {
    position: relative;
    justify-content: center;
    border-bottom: none;
}

.update-head h2 {
    text-align: center;
}

.update-close {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
}

.update-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text);
    min-height: 48px;
}

.update-version {
    margin: 0;
    font-weight: 600;
    text-align: center;
}

.update-notes {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
}

.update-progress {
    margin: 0;
    white-space: pre-wrap;
    text-align: center;
    color: var(--text-muted);
}

.update-error {
    margin: 0;
    text-align: center;
    color: var(--danger);
}

.update-foot {
    justify-content: center;
    gap: 10px;
    border-top: none;
}
</style>
