<script setup lang="ts">
/**
 * 终端更多设置：快捷键、配色、背景图、字体。
 */
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "../i18n";
import {
  clampFontSize,
  FONT_PRESETS,
  FONT_SIZE_PRESETS,
  useTerminalPrefsStore,
} from "../stores/terminalPrefs";
import { useUiStore } from "../stores/ui";
import AppSelect from "./AppSelect.vue";

const ui = useUiStore();
const termPrefs = useTerminalPrefsStore();
const { t } = useI18n();
const { prefs } = storeToRefs(termPrefs);

const colorSchemeOptions = computed(() => [
  { value: "theme", label: t("terminalSettings.schemeTheme") },
  { value: "dark", label: t("terminalSettings.schemeDark") },
  { value: "light", label: t("terminalSettings.schemeLight") },
  { value: "custom", label: t("terminalSettings.schemeCustom") },
]);

const fontFamilyOptions = computed(() =>
  FONT_PRESETS.map((font) => ({
    value: font,
    label: font.split(",")[0]!.trim(),
  }))
);

const fontSizeDraft = ref(String(prefs.value.fontSize));
const sizeMenuOpen = ref(false);
const sizeComboEl = ref<HTMLElement | null>(null);
const sizeMenuEl = ref<HTMLElement | null>(null);
const sizeMenuStyle = ref<Record<string, string>>({});

watch(
  () => prefs.value.fontSize,
  (n) => {
    fontSizeDraft.value = String(n);
  }
);

function commitFontSize() {
  const next = clampFontSize(Number(fontSizeDraft.value));
  prefs.value.fontSize = next;
  fontSizeDraft.value = String(next);
}

function pickFontSize(size: number) {
  prefs.value.fontSize = size;
  fontSizeDraft.value = String(size);
  sizeMenuOpen.value = false;
}

function updateSizeMenuPosition() {
  const trigger = sizeComboEl.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  sizeMenuStyle.value = {
    position: "fixed",
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    top: `${rect.bottom + gap}px`,
    maxHeight: "220px",
  };
}

async function toggleSizeMenu() {
  if (sizeMenuOpen.value) {
    sizeMenuOpen.value = false;
    return;
  }
  commitFontSize();
  sizeMenuOpen.value = true;
  updateSizeMenuPosition();
  await nextTick();
}

function onSizeDocPointerDown(e: PointerEvent) {
  if (!sizeMenuOpen.value) return;
  const target = e.target as Node;
  if (sizeComboEl.value?.contains(target) || sizeMenuEl.value?.contains(target)) return;
  sizeMenuOpen.value = false;
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) ui.closeTerminalSettingsModal();
}

/** Read image as data URL so the terminal can show it without asset:// scopes. */
function pickBackground() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      if (result.startsWith("data:")) prefs.value.backgroundImage = result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function clearBackground() {
  prefs.value.backgroundImage = "";
}

onMounted(() => {
  document.addEventListener("pointerdown", onSizeDocPointerDown);
  window.addEventListener("resize", () => {
    if (sizeMenuOpen.value) updateSizeMenuPosition();
  });
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onSizeDocPointerDown);
});
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal sm" role="dialog" aria-labelledby="termSettingsTitle">
      <div class="modal-head">
        <div>
          <h2 id="termSettingsTitle">{{ t("terminalSettings.title") }}</h2>
          <div class="sub">{{ t("terminalSettings.sub") }}</div>
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
        <div class="section-label">{{ t("terminalSettings.shortcuts") }}</div>
        <div class="field-grid">
          <label class="field">
            <span>{{ t("terminal.ctxCopy") }}</span>
            <input v-model="prefs.shortcuts.copy" type="text" spellcheck="false" />
          </label>
          <label class="field">
            <span>{{ t("terminal.ctxPaste") }}</span>
            <input v-model="prefs.shortcuts.paste" type="text" spellcheck="false" />
          </label>
          <label class="field">
            <span>{{ t("terminal.ctxFind") }}</span>
            <input v-model="prefs.shortcuts.find" type="text" spellcheck="false" />
          </label>
          <label class="field">
            <span>{{ t("terminal.ctxClear") }}</span>
            <input v-model="prefs.shortcuts.clear" type="text" spellcheck="false" />
          </label>
          <label class="field">
            <span>{{ t("terminalSettings.newSession") }}</span>
            <input v-model="prefs.shortcuts.newSession" type="text" spellcheck="false" />
          </label>
          <label class="field">
            <span>{{ t("terminalSettings.closeTab") }}</span>
            <input v-model="prefs.shortcuts.closeTab" type="text" spellcheck="false" />
          </label>
          <label class="field">
            <span>{{ t("terminalSettings.aiChat") }}</span>
            <input v-model="prefs.shortcuts.aiChat" type="text" spellcheck="false" />
          </label>
        </div>
        <p class="hint">{{ t("terminalSettings.shortcutsHint") }}</p>

        <div class="section-label">{{ t("terminalSettings.colors") }}</div>
        <label class="field">
          <span>{{ t("terminalSettings.colorScheme") }}</span>
          <AppSelect v-model="prefs.colorScheme" :options="colorSchemeOptions" />
        </label>
        <div v-if="prefs.colorScheme === 'custom'" class="color-grid">
          <label class="color-field">
            <span class="color-label">{{ t("terminalSettings.bg") }}</span>
            <span class="color-swatch">
              <span class="color-chip" :style="{ background: prefs.customColors.background }" />
              <span class="color-hex">{{ prefs.customColors.background }}</span>
              <input v-model="prefs.customColors.background" type="color" :aria-label="t('terminalSettings.bg')" />
            </span>
          </label>
          <label class="color-field">
            <span class="color-label">{{ t("terminalSettings.fg") }}</span>
            <span class="color-swatch">
              <span class="color-chip" :style="{ background: prefs.customColors.foreground }" />
              <span class="color-hex">{{ prefs.customColors.foreground }}</span>
              <input v-model="prefs.customColors.foreground" type="color" :aria-label="t('terminalSettings.fg')" />
            </span>
          </label>
          <label class="color-field">
            <span class="color-label">{{ t("terminalSettings.cursor") }}</span>
            <span class="color-swatch">
              <span class="color-chip" :style="{ background: prefs.customColors.cursor }" />
              <span class="color-hex">{{ prefs.customColors.cursor }}</span>
              <input v-model="prefs.customColors.cursor" type="color" :aria-label="t('terminalSettings.cursor')" />
            </span>
          </label>
        </div>

        <div class="section-label">{{ t("terminalSettings.background") }}</div>
        <div class="bg-row">
          <input
            v-model="prefs.backgroundImage"
            type="text"
            class="bg-input"
            :placeholder="t('terminalSettings.bgPlaceholder')"
            spellcheck="false"
          />
          <button type="button" class="btn ghost md" @click="pickBackground">
            {{ t("terminalSettings.pickImage") }}
          </button>
          <button
            type="button"
            class="btn ghost md"
            :disabled="!prefs.backgroundImage"
            @click="clearBackground"
          >
            {{ t("common.delete") }}
          </button>
        </div>
        <label class="field">
          <span>{{ t("terminalSettings.bgOpacity") }} ({{ Math.round(prefs.backgroundOpacity * 100) }}%)</span>
          <input v-model.number="prefs.backgroundOpacity" type="range" min="0" max="1" step="0.01" />
        </label>

        <div class="section-label">{{ t("terminalSettings.font") }}</div>
        <label class="field">
          <span>{{ t("terminalSettings.fontFamily") }}</span>
          <AppSelect v-model="prefs.fontFamily" :options="fontFamilyOptions" />
        </label>
        <label class="field">
          <span>{{ t("terminalSettings.fontSize") }}</span>
          <div ref="sizeComboEl" class="size-combo" :class="{ open: sizeMenuOpen }">
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
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
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
                  :class="{ selected: size === prefs.fontSize }"
                  :aria-selected="size === prefs.fontSize"
                  @click="pickFontSize(size)"
                >
                  <span>{{ size }}</span>
                  <span v-if="size === prefs.fontSize" class="size-combo-check" aria-hidden="true">✓</span>
                </li>
              </ul>
            </Transition>
          </Teleport>
        </label>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn ghost md" @click="termPrefs.reset()">
          {{ t("terminalSettings.reset") }}
        </button>
        <span class="foot-spacer" />
        <button type="button" class="btn primary md" @click="ui.closeTerminalSettingsModal()">
          {{ t("common.close") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal.sm {
  width: min(520px, 100%);
}

.modal :deep(.modal-head) {
  padding: 10px 12px;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(68vh, 640px);
  overflow: auto;
}

.section-label {
  margin-top: 6px;
  font-size: 10px;
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
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.field input[type="text"] {
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-root);
  color: var(--text);
  font-size: 12px;
}

.field input[type="range"] {
  width: 100%;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
}

.size-combo {
  display: flex;
  align-items: center;
  height: 28px;
  border-radius: var(--radius, 6px);
  border: 1px solid var(--border);
  background: var(--bg-root);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.size-combo:hover {
  border-color: var(--text-dim);
  background: var(--bg-elevated);
}

.size-combo.open,
.size-combo:focus-within {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.size-combo-input {
  flex: 1;
  min-width: 0;
  height: 100% !important;
  padding: 0 8px 0 10px !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--text);
  font-size: 12.5px;
  outline: none;
  box-shadow: none !important;
}

.size-combo-chevron {
  width: 28px;
  height: 100%;
  display: grid;
  place-items: center;
  border: none;
  border-left: 1px solid var(--border-soft);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
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
  gap: 10px;
}

.color-field {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0px;
  font-size: 12px;
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
  gap: 8px;
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 8px 0 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-root);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  overflow: hidden;
}

.color-swatch:hover {
  border-color: var(--accent-border);
  background: var(--bg-hover);
}

.color-chip {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.color-hex {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.color-swatch input[type="color"] {
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
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.4;
}

.bg-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.bg-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-root);
  color: var(--text);
  font-size: 12px;
}

.foot-spacer {
  flex: 1;
}
</style>

<style>
.size-combo-menu {
  z-index: 80;
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.28),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: var(--font-ui);
}

.size-combo-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
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
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
}

.select-menu-enter-active,
.select-menu-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.select-menu-enter-from,
.select-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
