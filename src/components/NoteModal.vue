<script setup lang="ts">
/**
 * Remote announcement modal driven by `VITE_NOTE_URL`.
 * Confirm opens `openUrl` when set; otherwise only dismisses.
 */
import { storeToRefs } from 'pinia'
import { useI18n } from '../i18n'
import { useNoteStore } from '../stores/note'

const note = useNoteStore()
const { t } = useI18n()
const { noteText, modalOpen } = storeToRefs(note)

function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) note.dismiss()
}
</script>

<template>
    <div v-if="modalOpen" class="overlay overlay-top" @click="onBackdrop">
        <div
            class="modal sm note-modal"
            role="dialog"
            aria-labelledby="noteModalTitle"
        >
            <div class="modal-head note-head">
                <h2 id="noteModalTitle">{{ t('noteModal.title') }}</h2>
                <button
                    type="button"
                    class="icon-btn note-close"
                    :aria-label="t('common.close')"
                    @click="note.dismiss()"
                >
                    ✕
                </button>
            </div>
            <div class="modal-body note-body">{{ noteText }}</div>
            <div class="modal-foot note-foot">
                <button
                    type="button"
                    class="btn primary md"
                    @click="note.confirm()"
                >
                    {{ t('common.confirm') }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.note-head {
    position: relative;
    justify-content: center;
    border-bottom: none;
}

.note-head h2 {
    text-align: center;
}

.note-close {
    position: absolute;
    right: calc(12px * var(--ui-scale, 1));
    top: 50%;
    transform: translateY(-50%);
}

.note-body {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: calc(13px * var(--ui-scale, 1));
    line-height: 1.55;
    color: var(--text);
    text-align: center;
    min-height: calc(48px * var(--ui-scale, 1));
}

.note-foot {
    justify-content: center;
    border-top: none;
}
</style>
