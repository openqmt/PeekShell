<script setup lang="ts">
/** 界面显示设置：控制侧栏、资源管理器列、AI 面板显隐与主题色。 */
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "../i18n";
import {
  ACCENT_COLOR_PRESETS,
  normalizeAccentColor,
  useUiStore,
} from "../stores/ui";

const ui = useUiStore();
const { t } = useI18n();
const { displayPrefs, theme } = storeToRefs(ui);

const themeDefaultAccent = computed(() =>
  theme.value === "light" ? "#1f9d63" : "#3ecf8e"
);

const isDefaultAccent = computed(() => !displayPrefs.value.accentColor);

const isCustomAccent = computed(() => {
  const hex = displayPrefs.value.accentColor;
  return !!hex && !(ACCENT_COLOR_PRESETS as readonly string[]).includes(hex);
});

const pickerValue = computed(() =>
  displayPrefs.value.accentColor || themeDefaultAccent.value
);

function setAccent(hex: string) {
  displayPrefs.value.accentColor = normalizeAccentColor(hex);
}

function clearAccent() {
  displayPrefs.value.accentColor = "";
}

function onPickerInput(e: Event) {
  setAccent((e.target as HTMLInputElement).value);
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) ui.closeDisplaySettingsModal();
}
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal sm" role="dialog" aria-labelledby="displaySettingsTitle">
      <div class="modal-head">
        <div>
          <h2 id="displaySettingsTitle">{{ t("displaySettings.title") }}</h2>
          <div class="sub">{{ t("displaySettings.sub") }}</div>
        </div>
        <button
          type="button"
          class="icon-btn"
          :aria-label="t('common.close')"
          @click="ui.closeDisplaySettingsModal()"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <div class="section-label">{{ t("displaySettings.accentSection") }}</div>
        <div class="accent-row">
          <button
            type="button"
            class="accent-swatch default"
            :class="{ active: isDefaultAccent }"
            :title="t('displaySettings.accentDefault')"
            :aria-label="t('displaySettings.accentDefault')"
            :aria-pressed="isDefaultAccent"
            @click="clearAccent"
          >
            <span class="swatch-fill" :style="{ background: themeDefaultAccent }" />
            <span class="swatch-label">{{ t("displaySettings.accentDefault") }}</span>
          </button>
          <button
            v-for="hex in ACCENT_COLOR_PRESETS"
            :key="hex"
            type="button"
            class="accent-swatch"
            :class="{ active: displayPrefs.accentColor === hex }"
            :style="{ '--swatch': hex }"
            :title="hex"
            :aria-label="hex"
            :aria-pressed="displayPrefs.accentColor === hex"
            @click="setAccent(hex)"
          >
            <span class="swatch-fill" />
          </button>
          <label
            class="color-swatch"
            :class="{ active: isCustomAccent }"
            :title="t('displaySettings.accentPick')"
          >
            <span class="color-chip" :style="{ background: pickerValue }" />
            <span class="color-hex">{{ pickerValue }}</span>
            <input
              type="color"
              :value="pickerValue"
              :aria-label="t('displaySettings.accentPick')"
              @input="onPickerInput"
            />
          </label>
        </div>

        <div class="section-label">{{ t("displaySettings.sidebarSection") }}</div>
        <div class="check-grid">
          <label class="check">
            <input v-model="displayPrefs.sidebar.system" type="checkbox" />
            <span>{{ t("displaySettings.sidebarSystem") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.sidebar.resources" type="checkbox" />
            <span>{{ t("displaySettings.sidebarResources") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.sidebar.processes" type="checkbox" />
            <span>{{ t("displaySettings.sidebarProcesses") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.sidebar.network" type="checkbox" />
            <span>{{ t("displaySettings.sidebarNetwork") }}</span>
          </label>
        </div>

        <div class="section-label">{{ t("displaySettings.coreSection") }}</div>
        <div class="check-grid">
          <label class="check">
            <input v-model="displayPrefs.explorer.show" type="checkbox" />
            <span>{{ t("displaySettings.explorer") }}</span>
          </label>
        </div>
        <div class="section-hint">{{ t("displaySettings.attrColumns") }}</div>
        <div class="check-grid nested">
          <label class="check">
            <input v-model="displayPrefs.explorer.colName" type="checkbox" />
            <span>{{ t("explorer.colName") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colSize" type="checkbox" />
            <span>{{ t("explorer.colSize") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colType" type="checkbox" />
            <span>{{ t("explorer.colType") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colModified" type="checkbox" />
            <span>{{ t("explorer.colModified") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colPermissions" type="checkbox" />
            <span>{{ t("explorer.colPermissions") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colGroup" type="checkbox" />
            <span>{{ t("explorer.colGroup") }}</span>
          </label>
        </div>

        <div class="section-label">{{ t("displaySettings.aiSection") }}</div>
        <div class="check-grid">
          <label class="check">
            <input v-model="displayPrefs.aiPanel" type="checkbox" />
            <span>{{ t("displaySettings.aiPanel") }}</span>
          </label>
        </div>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn ghost md" @click="ui.resetDisplayPrefs()">
          {{ t("displaySettings.reset") }}
        </button>
        <span class="foot-spacer" />
        <button type="button" class="btn primary md" @click="ui.closeDisplaySettingsModal()">
          {{ t("common.close") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal.sm {
  width: min(560px, 100%);
}

.modal :deep(.modal-head) {
  padding: 10px 12px;
}

.modal :deep(.modal-head h2) {
  font-size: 14px;
}

.modal :deep(.modal-head .sub) {
  margin-top: 1px;
}

.modal :deep(.modal-body) {
  padding: 10px 12px;
}

.modal :deep(.modal-foot) {
  padding: 8px 12px;
  gap: 6px;
}

.modal :deep(.section-label) {
  margin: 2px 0 6px;
  letter-spacing: 0.05em;
}

.modal :deep(.section-label:not(:first-child)) {
  margin-top: 4px;
}

.accent-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.accent-swatch {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-elevated);
  cursor: pointer;
  flex-shrink: 0;
}

.accent-swatch.default {
  width: auto;
  height: 32px;
  padding: 0 8px 0 6px;
  gap: 6px;
}

.accent-swatch .swatch-fill {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--swatch);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}

.accent-swatch.default .swatch-fill {
  width: 14px;
  height: 14px;
}

.swatch-label {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.accent-swatch.active {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 2px var(--accent-dim);
}

/* Same pattern as TerminalSettingsModal background color input */
.color-swatch {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  width: 118px;
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

.color-swatch.active {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 2px var(--accent-dim);
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

.check-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px 8px;
  margin-bottom: 10px;
}

.check-grid.nested {
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--bg-elevated);
}

.section-hint {
  font-size: 11px;
  color: var(--text-dim);
  margin: -4px 0 0;
  line-height: 1.3;
}

.check {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  min-height: 26px;
  min-width: 0;
}

.check span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}

.foot-spacer {
  flex: 1;
}
</style>
