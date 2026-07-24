<script setup lang="ts">
/**
 * App settings shell: left nav (display / about), right content pane.
 * Display prefs control sidebar, explorer columns, AI panel, and accent color.
 */
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import appIcon from "../assets/app-icon.png";
import { useI18n } from "../i18n";
import {
  ACCENT_COLOR_PRESETS,
  normalizeAccentColor,
  useUiStore,
} from "../stores/ui";

type SettingsSection = "display" | "about";

const WEBSITE_URL = "https://www.openqmt.com/";
const WEBSITE_LABEL = "https://www.openqmt.com";
const GITHUB_URL = "https://github.com/openqmt/PeekShell";
const GITHUB_LABEL = "https://github.com/openqmt/PeekShell";

const ui = useUiStore();
const { t } = useI18n();
const { displayPrefs, theme } = storeToRefs(ui);

const section = ref<SettingsSection>("display");
const version = ref("…");

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

onMounted(async () => {
  try {
    version.value = await getVersion();
  } catch {
    version.value = "0.1.0";
  }
});

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

async function openLink(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal settings-modal" role="dialog" aria-labelledby="settingsModalTitle">
      <div class="modal-head">
        <div>
          <h2 id="settingsModalTitle">{{ t("settingsModal.title") }}</h2>
          <div class="sub">{{ t("settingsModal.sub") }}</div>
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

      <div class="settings-layout">
        <nav class="settings-nav" aria-label="settings">
          <button
            type="button"
            class="nav-item"
            :class="{ active: section === 'display' }"
            @click="section = 'display'"
          >
            {{ t("displaySettings.title") }}
          </button>
          <button
            type="button"
            class="nav-item"
            :class="{ active: section === 'about' }"
            @click="section = 'about'"
          >
            {{ t("about.title") }}
          </button>
        </nav>

        <div class="settings-pane">
          <div v-if="section === 'display'" class="pane-scroll">
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

            <div class="pane-actions">
              <button type="button" class="btn ghost md" @click="ui.resetDisplayPrefs()">
                {{ t("displaySettings.reset") }}
              </button>
            </div>
          </div>

          <div v-else class="pane-scroll about-pane">
            <div class="about-hero">
              <img class="about-logo" :src="appIcon" alt="PeekShell" width="72" height="72" />
              <div class="about-name">PeekShell</div>
              <div class="about-version">{{ t("about.version", { v: version }) }}</div>
            </div>
            <p class="about-blurb">{{ t("about.blurb") }}</p>
            <div class="about-card">
              <div class="about-row">
                <span class="about-label">{{ t("about.websiteLabel") }}</span>
                <button type="button" class="about-link" @click="openLink(WEBSITE_URL)">
                  {{ WEBSITE_LABEL }}
                </button>
              </div>
              <div class="about-row">
                <span class="about-label">{{ t("about.githubLabel") }}</span>
                <button type="button" class="about-link" @click="openLink(GITHUB_URL)">
                  {{ GITHUB_LABEL }}
                </button>
              </div>
              <div class="about-row">
                <span class="about-label">{{ t("about.principleLabel") }}</span>
                <span class="about-value">{{ t("about.principleValue") }}</span>
              </div>
            </div>
            <p class="about-footer">{{ t("about.footer") }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-modal {
  width: min(640px, 100%);
  height: min(520px, calc(100vh - 48px));
  max-height: min(520px, calc(100vh - 48px));
}

.settings-modal :deep(.modal-head) {
  padding: 10px 12px;
  flex-shrink: 0;
}

.settings-modal :deep(.modal-head h2) {
  font-size: 14px;
}

.settings-modal :deep(.modal-head .sub) {
  margin-top: 1px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
  border-top: 1px solid var(--border-soft);
  overflow: hidden;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-right: 1px solid var(--border-soft);
  background: var(--bg-elevated);
  overflow: auto;
}

.nav-item {
  margin: 0;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.nav-item.active {
  background: var(--accent-dim);
  color: var(--accent);
  font-weight: 600;
}

.settings-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px 14px;
}

.pane-actions {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
}

.section-label {
  margin: 2px 0 6px;
  letter-spacing: 0.05em;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-dim);
}

.section-label:not(:first-child) {
  margin-top: 10px;
}

.accent-row {
  display: flex;
  flex-wrap: wrap;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.about-pane {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  padding-top: 18px;
  padding-bottom: 18px;
}

.about-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.about-logo {
  width: 72px;
  height: 72px;
  border-radius: 13px;
  object-fit: cover;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}

.about-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text);
}

.about-version {
  font-size: 12px;
  color: var(--text-muted);
}

.about-blurb {
  margin: 0;
  max-width: 36em;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-muted);
}

.about-card {
  width: 100%;
  overflow: hidden;
  text-align: left;
}

.about-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 10px;
}

.about-row:last-child {
  border-bottom: none;
}

.about-label {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text);
}

.about-link {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.4;
  text-align: right;
  word-break: break-all;
  cursor: pointer;
}

.about-link:hover {
  text-decoration: underline;
}

.about-value {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-muted);
  text-align: right;
}

.about-footer {
  margin: 4px 0 0;
  max-width: 36em;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-dim);
}
</style>
