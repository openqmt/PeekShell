<script setup lang="ts">
/**
 * Site-wide announcement from remote pslnotes.json.
 * Shows when webShow is true and the locale note is non-empty.
 * Locale copy follows VitePress lang (zh / en / ja / ko), with fallback.
 * repeatShow=false: dismiss once per fingerprint (localStorage).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'

const NOTE_URL = 'https://files.openqmt.com/files/pslnotes.json'
const DISMISSED_KEY = 'peekshell.web.note.dismissedFingerprint'

type NoteLocale = 'zh' | 'en' | 'ja' | 'ko'

const UI_COPY: Record<
  NoteLocale,
  { title: string; confirm: string; close: string }
> = {
  zh: { title: '通知', confirm: '确定', close: '关闭' },
  en: { title: 'Notice', confirm: 'OK', close: 'Close' },
  ja: { title: 'お知らせ', confirm: 'OK', close: '閉じる' },
  ko: { title: '알림', confirm: '확인', close: '닫기' },
}

const { lang } = useData()

const open = ref(false)
const noteText = ref('')
const openUrlTarget = ref('')
const repeatShow = ref(true)
const fingerprint = ref('')
const remote = ref<Record<string, unknown> | null>(null)

const localeKey = computed<NoteLocale>(() => {
  const l = (lang.value || '').toLowerCase()
  if (l.startsWith('zh')) return 'zh'
  if (l.startsWith('ja')) return 'ja'
  if (l.startsWith('ko')) return 'ko'
  if (l.startsWith('en')) return 'en'
  return 'zh'
})

const ui = computed(() => UI_COPY[localeKey.value])
const title = computed(() => ui.value.title)
const confirmLabel = computed(() => ui.value.confirm)
const closeLabel = computed(() => ui.value.close)

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeDismissed(value: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, value)
  } catch {
    // ignore quota / private mode
  }
}

function buildFingerprint(payload: {
  version: string
  pub_date: string
  openUrl: string
  note: string
}): string {
  return [payload.version, payload.pub_date, payload.openUrl, payload.note].join(
    '\0',
  )
}

/** Prefer current site locale, then zh → en → ja → ko. */
function pickNote(raw: Record<string, unknown>, key: NoteLocale): string {
  const order: NoteLocale[] = [key, 'zh', 'en', 'ja', 'ko']
  const seen = new Set<NoteLocale>()
  for (const k of order) {
    if (seen.has(k)) continue
    seen.add(k)
    const block = raw[k]
    if (!block || typeof block !== 'object') continue
    const note = asString((block as Record<string, unknown>).note).trim()
    if (note) return note
  }
  return ''
}

function applyRemote() {
  const raw = remote.value
  if (!raw || !asBool(raw.webShow, false)) {
    open.value = false
    return
  }

  const text = pickNote(raw, localeKey.value)
  if (!text) {
    open.value = false
    return
  }

  const version = asString(raw.version)
  const pubDate = asString(raw.pub_date)
  const openUrl = asString(raw.openUrl).trim()
  const repeat = asBool(raw.repeatShow, true)
  const fp = buildFingerprint({
    version,
    pub_date: pubDate,
    openUrl,
    note: text,
  })

  if (!repeat && fp === readDismissed()) {
    open.value = false
    return
  }

  noteText.value = text
  openUrlTarget.value = openUrl
  repeatShow.value = repeat
  fingerprint.value = fp
  open.value = true
}

function dismiss() {
  if (!repeatShow.value && fingerprint.value) {
    writeDismissed(fingerprint.value)
  }
  open.value = false
}

function confirm() {
  const url = openUrlTarget.value.trim()
  dismiss()
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) dismiss()
}

watch(localeKey, () => {
  if (remote.value) applyRemote()
})

onMounted(async () => {
  try {
    const res = await fetch(NOTE_URL, { cache: 'no-store' })
    if (!res.ok) return
    remote.value = (await res.json()) as Record<string, unknown>
    applyRemote()
  } catch {
    // Offline / CORS / bad JSON: skip silently
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ps-note-overlay"
      role="presentation"
      @click="onBackdrop"
    >
      <div
        class="ps-note-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'ps-note-title'"
      >
        <div class="ps-note-head">
          <h2 id="ps-note-title">{{ title }}</h2>
          <button
            type="button"
            class="ps-note-close"
            :aria-label="closeLabel"
            @click="dismiss"
          >
            ✕
          </button>
        </div>
        <div class="ps-note-body">{{ noteText }}</div>
        <div class="ps-note-foot">
          <button type="button" class="ps-note-confirm" @click="confirm">
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ps-note-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: max(12vh, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  background: rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
}

.ps-note-modal {
  width: min(100%, 420px);
  max-height: min(80vh, 560px);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.ps-note-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 48px 8px;
  flex-shrink: 0;
}

.ps-note-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
}

.ps-note-close {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.ps-note-close:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.ps-note-body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 8px 20px 16px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  text-align: center;
  -webkit-overflow-scrolling: touch;
}

.ps-note-foot {
  display: flex;
  justify-content: center;
  padding: 0 20px 18px;
  flex-shrink: 0;
}

.ps-note-confirm {
  min-width: 120px;
  min-height: 40px;
  padding: 0 20px;
  border: none;
  border-radius: 10px;
  background: var(--vp-c-brand-1);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.ps-note-confirm:hover {
  background: var(--vp-c-brand-2);
}

@media (max-width: 480px) {
  .ps-note-overlay {
    align-items: flex-start;
    padding: max(10vh, env(safe-area-inset-top))
      max(12px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom))
      max(12px, env(safe-area-inset-left));
  }

  .ps-note-modal {
    width: 100%;
    max-height: min(80vh, 560px);
    border-radius: 14px;
  }

  .ps-note-head {
    padding: 18px 48px 10px;
  }

  .ps-note-head h2 {
    font-size: 16px;
  }

  .ps-note-body {
    padding: 4px 18px 14px;
    font-size: 15px;
    text-align: left;
  }

  .ps-note-foot {
    padding: 0 18px 16px;
  }

  .ps-note-confirm {
    width: 100%;
    min-height: 44px;
  }
}
</style>
