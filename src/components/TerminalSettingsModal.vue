<script setup lang="ts">
/**
 * 终端更多设置：快捷键、配色、背景图、字体。
 */
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import {
    BACKGROUND_IMAGE_PRESETS,
    backgroundPresetId,
    clampFontSize,
    FONT_PRESETS,
    FONT_SIZE_PRESETS,
    presetBackgroundValue,
    type BackgroundImagePresetId,
    useTerminalPrefsStore,
} from '../stores/terminalPrefs'
import { useUiStore } from '../stores/ui'
import AppSelect from './AppSelect.vue'

const ui = useUiStore()
const termPrefs = useTerminalPrefsStore()
const { t } = useI18n()
const { prefs } = storeToRefs(termPrefs)

const selectedBgPresetId = computed(() =>
    backgroundPresetId(prefs.value.backgroundImage),
)

function selectBgPreset(id: BackgroundImagePresetId) {
    prefs.value.backgroundImage = presetBackgroundValue(id)
}

function selectCustomBackground(src: string) {
    prefs.value.backgroundImage = src
}

function clearBackground() {
    prefs.value.backgroundImage = ''
}

function removeCustomBackground(index: number) {
    const removed = prefs.value.customBackgroundImages[index]
    if (removed == null) return
    prefs.value.customBackgroundImages.splice(index, 1)
    if (prefs.value.backgroundImage === removed) {
        prefs.value.backgroundImage = ''
    }
}

const colorSchemeOptions = computed(() => [
    { value: 'theme', label: t('terminalSettings.schemeTheme') },
    { value: 'dark', label: t('terminalSettings.schemeDark') },
    { value: 'light', label: t('terminalSettings.schemeLight') },
    { value: 'custom', label: t('terminalSettings.schemeCustom') },
])

const fontFamilyOptions = computed(() =>
    FONT_PRESETS.map((font) => ({
        value: font,
        label: font.split(',')[0]!.trim(),
    })),
)

const fontSizeDraft = ref(String(prefs.value.fontSize))
const sizeMenuOpen = ref(false)
const sizeComboEl = ref<HTMLElement | null>(null)
const sizeMenuEl = ref<HTMLElement | null>(null)
const sizeMenuStyle = ref<Record<string, string>>({})

watch(
    () => prefs.value.fontSize,
    (n) => {
        fontSizeDraft.value = String(n)
    },
)

function commitFontSize() {
    const next = clampFontSize(Number(fontSizeDraft.value))
    prefs.value.fontSize = next
    fontSizeDraft.value = String(next)
}

function pickFontSize(size: number) {
    prefs.value.fontSize = size
    fontSizeDraft.value = String(size)
    sizeMenuOpen.value = false
}

function updateSizeMenuPosition() {
    const trigger = sizeComboEl.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const gap = 6
    sizeMenuStyle.value = {
        position: 'fixed',
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        top: `${rect.bottom + gap}px`,
        maxHeight: '220px',
    }
}

async function toggleSizeMenu() {
    if (sizeMenuOpen.value) {
        sizeMenuOpen.value = false
        return
    }
    commitFontSize()
    sizeMenuOpen.value = true
    updateSizeMenuPosition()
    await nextTick()
}

function onSizeDocPointerDown(e: PointerEvent) {
    if (!sizeMenuOpen.value) return
    const target = e.target as Node
    if (
        sizeComboEl.value?.contains(target) ||
        sizeMenuEl.value?.contains(target)
    )
        return
    sizeMenuOpen.value = false
}

function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) ui.closeTerminalSettingsModal()
}

/** Read image as data URL so the terminal can show it without asset:// scopes. */
function pickBackground() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp'
    input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            const result = String(reader.result ?? '')
            if (!result.startsWith('data:')) return
            if (!prefs.value.customBackgroundImages.includes(result)) {
                prefs.value.customBackgroundImages.push(result)
            }
            prefs.value.backgroundImage = result
        }
        reader.readAsDataURL(file)
    }
    input.click()
}

onMounted(() => {
    document.addEventListener('pointerdown', onSizeDocPointerDown)
    window.addEventListener('resize', () => {
        if (sizeMenuOpen.value) updateSizeMenuPosition()
    })
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onSizeDocPointerDown)
})
</script>

<template>
    <div class="overlay" @click="onBackdrop">
        <div class="modal sm" role="dialog" aria-labelledby="termSettingsTitle">
            <div class="modal-head">
                <div>
                    <h2 id="termSettingsTitle">
                        {{ t('terminalSettings.title') }}
                    </h2>
                    <div class="sub">{{ t('terminalSettings.sub') }}</div>
                </div>
                <button
                    type="button"
                    class="icon-btn"
                    :aria-label="t('common.close')"
                    @click="ui.closeTerminalSettingsModal()"
                >
                    ✕
                </button>
            </div>

            <div class="modal-body">
                <div class="section-label">
                    {{ t('terminalSettings.shortcuts') }}
                </div>
                <div class="field-grid">
                    <label class="field">
                        <span>{{ t('terminal.ctxCopy') }}</span>
                        <input
                            v-model="prefs.shortcuts.copy"
                            type="text"
                            spellcheck="false"
                        />
                    </label>
                    <label class="field">
                        <span>{{ t('terminal.ctxPaste') }}</span>
                        <input
                            v-model="prefs.shortcuts.paste"
                            type="text"
                            spellcheck="false"
                        />
                    </label>
                    <label class="field">
                        <span>{{ t('terminal.ctxFind') }}</span>
                        <input
                            v-model="prefs.shortcuts.find"
                            type="text"
                            spellcheck="false"
                        />
                    </label>
                    <label class="field">
                        <span>{{ t('terminal.ctxClear') }}</span>
                        <input
                            v-model="prefs.shortcuts.clear"
                            type="text"
                            spellcheck="false"
                        />
                    </label>
                    <label class="field">
                        <span>{{ t('terminalSettings.newSession') }}</span>
                        <input
                            v-model="prefs.shortcuts.newSession"
                            type="text"
                            spellcheck="false"
                        />
                    </label>
                    <label class="field">
                        <span>{{ t('terminalSettings.closeTab') }}</span>
                        <input
                            v-model="prefs.shortcuts.closeTab"
                            type="text"
                            spellcheck="false"
                        />
                    </label>
                    <label class="field">
                        <span>{{ t('terminalSettings.aiChat') }}</span>
                        <input
                            v-model="prefs.shortcuts.aiChat"
                            type="text"
                            spellcheck="false"
                        />
                    </label>
                </div>
                <p class="hint">{{ t('terminalSettings.shortcutsHint') }}</p>

                <div class="section-label">
                    {{ t('terminalSettings.colors') }}
                </div>
                <label class="field">
                    <span>{{ t('terminalSettings.colorScheme') }}</span>
                    <AppSelect
                        v-model="prefs.colorScheme"
                        :options="colorSchemeOptions"
                    />
                </label>
                <div v-if="prefs.colorScheme === 'custom'" class="color-grid">
                    <label class="color-field">
                        <span class="color-label">{{
                            t('terminalSettings.bg')
                        }}</span>
                        <span class="color-swatch">
                            <span
                                class="color-chip"
                                :style="{
                                    background: prefs.customColors.background,
                                }"
                            />
                            <span class="color-hex">{{
                                prefs.customColors.background
                            }}</span>
                            <input
                                v-model="prefs.customColors.background"
                                type="color"
                                :aria-label="t('terminalSettings.bg')"
                            />
                        </span>
                    </label>
                    <label class="color-field">
                        <span class="color-label">{{
                            t('terminalSettings.fg')
                        }}</span>
                        <span class="color-swatch">
                            <span
                                class="color-chip"
                                :style="{
                                    background: prefs.customColors.foreground,
                                }"
                            />
                            <span class="color-hex">{{
                                prefs.customColors.foreground
                            }}</span>
                            <input
                                v-model="prefs.customColors.foreground"
                                type="color"
                                :aria-label="t('terminalSettings.fg')"
                            />
                        </span>
                    </label>
                    <label class="color-field">
                        <span class="color-label">{{
                            t('terminalSettings.cursor')
                        }}</span>
                        <span class="color-swatch">
                            <span
                                class="color-chip"
                                :style="{
                                    background: prefs.customColors.cursor,
                                }"
                            />
                            <span class="color-hex">{{
                                prefs.customColors.cursor
                            }}</span>
                            <input
                                v-model="prefs.customColors.cursor"
                                type="color"
                                :aria-label="t('terminalSettings.cursor')"
                            />
                        </span>
                    </label>
                </div>

                <div class="section-label">
                    {{ t('terminalSettings.background') }}
                </div>
                <div
                    class="bg-presets"
                    role="listbox"
                    :aria-label="t('terminalSettings.bgPresets')"
                >
                    <button
                        type="button"
                        class="bg-preset"
                        role="option"
                        :aria-selected="!prefs.backgroundImage"
                        :class="{ active: !prefs.backgroundImage }"
                        :title="t('terminalSettings.bgNone')"
                        @click="clearBackground"
                    >
                        <span class="bg-preset-label">{{
                            t('terminalSettings.bgNone')
                        }}</span>
                    </button>
                    <button
                        v-for="preset in BACKGROUND_IMAGE_PRESETS"
                        :key="preset.id"
                        type="button"
                        class="bg-preset"
                        role="option"
                        :aria-selected="selectedBgPresetId === preset.id"
                        :class="{ active: selectedBgPresetId === preset.id }"
                        :title="preset.id"
                        :style="{ backgroundImage: `url(${preset.src})` }"
                        @click="selectBgPreset(preset.id)"
                    />
                    <div
                        v-for="(src, index) in prefs.customBackgroundImages"
                        :key="`custom-${index}`"
                        class="bg-preset-wrap"
                    >
                        <button
                            type="button"
                            class="bg-preset"
                            role="option"
                            :aria-selected="prefs.backgroundImage === src"
                            :class="{ active: prefs.backgroundImage === src }"
                            :title="t('terminalSettings.pickImage')"
                            :style="{ backgroundImage: `url(${src})` }"
                            @click="selectCustomBackground(src)"
                        />
                        <button
                            type="button"
                            class="bg-preset-remove"
                            :title="t('common.delete')"
                            :aria-label="t('common.delete')"
                            @click.stop="removeCustomBackground(index)"
                        >
                            <svg
                                viewBox="0 0 12 12"
                                width="10"
                                height="10"
                                aria-hidden="true"
                            >
                                <path
                                    d="M3 3l6 6M9 3L3 9"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.6"
                                    stroke-linecap="round"
                                />
                            </svg>
                        </button>
                    </div>
                    <button
                        type="button"
                        class="bg-preset add"
                        :title="t('terminalSettings.pickImage')"
                        :aria-label="t('terminalSettings.pickImage')"
                        @click="pickBackground"
                    >
                        <svg
                            viewBox="0 0 16 16"
                            width="16"
                            height="16"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M8 3.2v9.6M3.2 8h9.6"
                                stroke="currentColor"
                                stroke-width="1.6"
                                stroke-linecap="round"
                            />
                        </svg>
                    </button>
                </div>
                <label class="field">
                    <span
                        >{{ t('terminalSettings.bgOpacity') }} ({{
                            Math.round(prefs.backgroundOpacity * 100)
                        }}%)</span
                    >
                    <input
                        v-model.number="prefs.backgroundOpacity"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                    />
                </label>

                <div class="section-label">
                    {{ t('terminalSettings.font') }}
                </div>
                <label class="field">
                    <span>{{ t('terminalSettings.fontFamily') }}</span>
                    <AppSelect
                        v-model="prefs.fontFamily"
                        :options="fontFamilyOptions"
                    />
                </label>
                <label class="field">
                    <span>{{ t('terminalSettings.fontSize') }}</span>
                    <div
                        ref="sizeComboEl"
                        class="size-combo"
                        :class="{ open: sizeMenuOpen }"
                    >
                        <input
                            v-model="fontSizeDraft"
                            type="text"
                            inputmode="numeric"
                            class="size-combo-input"
                            spellcheck="false"
                            @keydown.enter.prevent="commitFontSize"
                            @blur="commitFontSize"
                        />
                        <button
                            type="button"
                            class="size-combo-chevron"
                            :aria-expanded="sizeMenuOpen"
                            aria-haspopup="listbox"
                            :aria-label="t('terminalSettings.fontSize')"
                            @mousedown.prevent
                            @click="toggleSizeMenu"
                        >
                            <svg
                                viewBox="0 0 16 16"
                                width="14"
                                height="14"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path
                                    d="M4.2 6.2 8 10l3.8-3.8"
                                    stroke="currentColor"
                                    stroke-width="1.6"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>
                    </div>
                    <Teleport to="body">
                        <Transition name="select-menu">
                            <ul
                                v-if="sizeMenuOpen"
                                ref="sizeMenuEl"
                                class="size-combo-menu"
                                role="listbox"
                                :style="sizeMenuStyle"
                            >
                                <li
                                    v-for="size in FONT_SIZE_PRESETS"
                                    :key="size"
                                    role="option"
                                    class="size-combo-option"
                                    :class="{
                                        selected: size === prefs.fontSize,
                                    }"
                                    :aria-selected="size === prefs.fontSize"
                                    @click="pickFontSize(size)"
                                >
                                    <span>{{ size }}</span>
                                    <span
                                        v-if="size === prefs.fontSize"
                                        class="size-combo-check"
                                        aria-hidden="true"
                                        >✓</span
                                    >
                                </li>
                            </ul>
                        </Transition>
                    </Teleport>
                </label>
            </div>

            <div class="modal-foot">
                <button
                    type="button"
                    class="btn ghost md"
                    @click="termPrefs.reset()"
                >
                    {{ t('terminalSettings.reset') }}
                </button>
                <span class="foot-spacer" />
                <button
                    type="button"
                    class="btn primary md"
                    @click="ui.closeTerminalSettingsModal()"
                >
                    {{ t('common.close') }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.modal.sm {
    width: min(calc(520px * var(--ui-scale, 1)), 100%);
}

.modal :deep(.modal-head) {
    padding: calc(10px * var(--ui-scale, 1)) calc(12px * var(--ui-scale, 1));
}

.modal-body {
    display: flex;
    flex-direction: column;
    gap: calc(8px * var(--ui-scale, 1));
    max-height: min(68vh, calc(640px * var(--ui-scale, 1)));
    overflow: auto;
}

.section-label {
    margin-top: calc(6px * var(--ui-scale, 1));
    font-size: calc(10px * var(--ui-scale, 1));
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-dim);
}

.section-label:first-child {
    margin-top: 0;
}

.field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: calc(8px * var(--ui-scale, 1));
}

.field {
    display: flex;
    flex-direction: column;
    gap: calc(4px * var(--ui-scale, 1));
    font-size: calc(12px * var(--ui-scale, 1));
    color: var(--text-muted);
}

.field input[type='text'] {
    height: calc(30px * var(--ui-scale, 1));
    padding: 0 calc(8px * var(--ui-scale, 1));
    border-radius: calc(6px * var(--ui-scale, 1));
    border: 1px solid var(--border);
    background: var(--bg-root);
    color: var(--text);
    font-size: calc(12px * var(--ui-scale, 1));
}

.field input[type='range'] {
    width: 100%;
    height: calc(28px * var(--ui-scale, 1));
    padding: 0;
    border: none;
    background: transparent;
}

.size-combo {
    display: flex;
    align-items: center;
    height: calc(28px * var(--ui-scale, 1));
    border-radius: var(--radius, calc(6px * var(--ui-scale, 1)));
    border: 1px solid var(--border);
    background: var(--bg-root);
    overflow: hidden;
    transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
}

.size-combo:hover {
    border-color: var(--text-dim);
    background: var(--bg-elevated);
}

.size-combo.open,
.size-combo:focus-within {
    border-color: var(--accent-border);
    box-shadow: 0 0 0 calc(3px * var(--ui-scale, 1)) var(--accent-dim);
}

.size-combo-input {
    flex: 1;
    min-width: 0;
    height: 100% !important;
    padding: 0 calc(8px * var(--ui-scale, 1)) 0 calc(10px * var(--ui-scale, 1)) !important;
    border: none !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: var(--text);
    font-size: calc(12.5px * var(--ui-scale, 1));
    outline: none;
    box-shadow: none !important;
}

.size-combo-chevron {
    width: calc(28px * var(--ui-scale, 1));
    height: 100%;
    display: grid;
    place-items: center;
    border: none;
    border-left: 1px solid var(--border-soft);
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    transition:
        color 0.15s ease,
        background 0.15s ease;
}

.size-combo-chevron:hover {
    background: var(--bg-hover);
    color: var(--text);
}

.size-combo.open .size-combo-chevron {
    color: var(--accent);
}

.size-combo.open .size-combo-chevron svg {
    transform: rotate(180deg);
}

.size-combo-chevron svg {
    transition: transform 0.18s ease;
}

.color-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: calc(10px * var(--ui-scale, 1));
}

.color-field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0px;
    font-size: calc(12px * var(--ui-scale, 1));
    color: var(--text-muted);
    min-width: 0;
}

.color-label {
    flex-shrink: 0;
    min-width: 2.5em;
}

.color-swatch {
    position: relative;
    display: flex;
    align-items: center;
    gap: calc(8px * var(--ui-scale, 1));
    flex: 1;
    min-width: 0;
    height: calc(32px * var(--ui-scale, 1));
    padding: 0 calc(8px * var(--ui-scale, 1)) 0 calc(6px * var(--ui-scale, 1));
    border-radius: calc(6px * var(--ui-scale, 1));
    border: 1px solid var(--border);
    background: var(--bg-root);
    cursor: pointer;
    transition:
        border-color 0.15s ease,
        background 0.15s ease;
    overflow: hidden;
}

.color-swatch:hover {
    border-color: var(--accent-border);
    background: var(--bg-hover);
}

.color-chip {
    width: calc(18px * var(--ui-scale, 1));
    height: calc(18px * var(--ui-scale, 1));
    border-radius: calc(4px * var(--ui-scale, 1));
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
    flex-shrink: 0;
}

.color-hex {
    font-family: var(--font-mono);
    font-size: calc(11px * var(--ui-scale, 1));
    color: var(--text);
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.color-swatch input[type='color'] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: none;
    opacity: 0;
    cursor: pointer;
}

.hint {
    margin: 0;
    font-size: calc(11px * var(--ui-scale, 1));
    color: var(--text-dim);
    line-height: 1.4;
}

.bg-presets {
    display: flex;
    flex-wrap: wrap;
    gap: calc(8px * var(--ui-scale, 1));
    margin-bottom: calc(10px * var(--ui-scale, 1));
}

.bg-preset-wrap {
    position: relative;
    flex-shrink: 0;
}

.bg-preset {
    width: calc(64px * var(--ui-scale, 1));
    height: calc(40px * var(--ui-scale, 1));
    padding: 0;
    border-radius: calc(6px * var(--ui-scale, 1));
    border: 1px solid var(--border);
    background-color: var(--bg-elevated);
    background-size: cover;
    background-position: center;
    cursor: pointer;
    transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
}

.bg-preset.none,
.bg-preset.add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
}

.bg-preset.none {
    background-image: linear-gradient(
        135deg,
        transparent 46%,
        var(--danger) 46%,
        var(--danger) 54%,
        transparent 54%
    );
}

.bg-preset.add:hover {
    color: var(--accent);
}

.bg-preset-label {
    font-size: calc(11px * var(--ui-scale, 1));
    color: var(--text-muted);
}

.bg-preset:hover {
    border-color: var(--accent-border);
}

.bg-preset.active {
    border-color: var(--accent-border);
    box-shadow: 0 0 0 calc(2px * var(--ui-scale, 1)) var(--accent-dim);
}

.bg-preset-remove {
    position: absolute;
    top: -5px;
    right: -5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: calc(16px * var(--ui-scale, 1));
    height: calc(16px * var(--ui-scale, 1));
    padding: 0;
    border: 1px solid var(--border);
    border-radius: calc(999px * var(--ui-scale, 1));
    background: var(--bg-elevated);
    color: var(--text-muted);
    cursor: pointer;
    line-height: 0;
    z-index: 1;
}

.bg-preset-remove:hover {
    color: var(--danger);
    border-color: var(--danger);
    background: var(--danger-dim);
}

.foot-spacer {
    flex: 1;
}
</style>

<style>
.size-combo-menu {
    z-index: 80;
    margin: 0;
    padding: calc(6px * var(--ui-scale, 1));
    list-style: none;
    overflow: auto;
    border-radius: calc(8px * var(--ui-scale, 1));
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    box-shadow:
        0 calc(10px * var(--ui-scale, 1)) calc(28px * var(--ui-scale, 1)) rgba(0, 0, 0, 0.28),
        0 calc(2px * var(--ui-scale, 1)) calc(6px * var(--ui-scale, 1)) rgba(0, 0, 0, 0.12);
    font-family: var(--font-ui);
}

.size-combo-option {
    display: flex;
    align-items: center;
    gap: calc(8px * var(--ui-scale, 1));
    min-height: calc(32px * var(--ui-scale, 1));
    padding: 0 calc(10px * var(--ui-scale, 1));
    border-radius: calc(6px * var(--ui-scale, 1));
    font-size: calc(13px * var(--ui-scale, 1));
    color: var(--text);
    cursor: pointer;
    user-select: none;
}

.size-combo-option:hover {
    background: var(--bg-hover);
}

.size-combo-option.selected {
    color: var(--accent);
    background: var(--accent-dim);
}

.size-combo-check {
    margin-left: auto;
    flex-shrink: 0;
    font-size: calc(11px * var(--ui-scale, 1));
    font-weight: 700;
    color: var(--accent);
}

.select-menu-enter-active,
.select-menu-leave-active {
    transition:
        opacity 0.14s ease,
        transform 0.14s ease;
}

.select-menu-enter-from,
.select-menu-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
</style>
