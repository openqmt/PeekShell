<script setup lang="ts">
/**
 * 终端更多设置：快捷键、配色、背景图、字体。
 */
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "../i18n";
import { FONT_PRESETS, useTerminalPrefsStore } from "../stores/terminalPrefs";
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
        </div>
        <p class="hint">{{ t("terminalSettings.shortcutsHint") }}</p>

        <div class="section-label">{{ t("terminalSettings.colors") }}</div>
        <label class="field">
          <span>{{ t("terminalSettings.colorScheme") }}</span>
          <AppSelect v-model="prefs.colorScheme" :options="colorSchemeOptions" />
        </label>
        <div v-if="prefs.colorScheme === 'custom'" class="color-grid">
          <label class="field color">
            <span>{{ t("terminalSettings.bg") }}</span>
            <input v-model="prefs.customColors.background" type="color" />
          </label>
          <label class="field color">
            <span>{{ t("terminalSettings.fg") }}</span>
            <input v-model="prefs.customColors.foreground" type="color" />
          </label>
          <label class="field color">
            <span>{{ t("terminalSettings.cursor") }}</span>
            <input v-model="prefs.customColors.cursor" type="color" />
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
          <input v-model.number="prefs.backgroundOpacity" type="range" min="0" max="1" step="0.05" />
        </label>

        <div class="section-label">{{ t("terminalSettings.font") }}</div>
        <label class="field">
          <span>{{ t("terminalSettings.fontFamily") }}</span>
          <AppSelect v-model="prefs.fontFamily" :options="fontFamilyOptions" />
        </label>
        <label class="field">
          <span>{{ t("terminalSettings.fontSize") }}</span>
          <input v-model.number="prefs.fontSize" type="number" min="10" max="32" step="1" />
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
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.field input[type="text"],
.field input[type="number"] {
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
}

.field.color {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.field.color input[type="color"] {
  width: 42px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.color-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
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
