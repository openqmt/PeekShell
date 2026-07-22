/** 侧栏折叠、主题、语言与弹窗显隐等纯 UI 状态。 */
import { setTheme as setTauriTheme } from "@tauri-apps/api/app";
import { defineStore } from "pinia";
import { reactive, ref, watch } from "vue";
import type { Locale } from "../i18n/messages";
import type { HostRecord } from "../types/host";

export type ThemeMode = "dark" | "light";

/** 各区域功能显隐偏好（持久化到 localStorage）。 */
export interface DisplayPrefs {
  sidebar: {
    system: boolean;
    resources: boolean;
    processes: boolean;
    network: boolean;
  };
  explorer: {
    show: boolean;
    colName: boolean;
    colSize: boolean;
    colType: boolean;
    colModified: boolean;
    colPermissions: boolean;
    colGroup: boolean;
  };
  aiPanel: boolean;
}

const THEME_KEY = "peekshell.theme";
const LOCALE_KEY = "peekshell.locale";
const DISPLAY_PREFS_KEY = "peekshell.displayPrefs";
const AI_PANEL_WIDTH_KEY = "peekshell.aiPanelWidth";
const SIDEBAR_WIDTH_KEY = "peekshell.sidebarWidth";

export const AI_PANEL_WIDTH_DEFAULT = 300;
export const AI_PANEL_WIDTH_MIN = 240;
export const AI_PANEL_WIDTH_MAX = 640;

export const SIDEBAR_WIDTH_DEFAULT = 240;
export const SIDEBAR_WIDTH_MIN = 180;
export const SIDEBAR_WIDTH_MAX = 420;

function clampAiPanelWidth(value: number) {
  return Math.min(AI_PANEL_WIDTH_MAX, Math.max(AI_PANEL_WIDTH_MIN, Math.round(value)));
}

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(value)));
}

function readStoredAiPanelWidth() {
  const raw = Number(localStorage.getItem(AI_PANEL_WIDTH_KEY));
  if (!Number.isFinite(raw)) return AI_PANEL_WIDTH_DEFAULT;
  return clampAiPanelWidth(raw);
}

function readStoredSidebarWidth() {
  const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(raw)) return SIDEBAR_WIDTH_DEFAULT;
  return clampSidebarWidth(raw);
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  sidebar: {
    system: true,
    resources: true,
    processes: true,
    network: true,
  },
  explorer: {
    show: true,
    colName: true,
    colSize: true,
    colType: true,
    colModified: true,
    colPermissions: true,
    colGroup: true,
  },
  aiPanel: true,
};

function readStoredTheme(): ThemeMode {
  const raw = localStorage.getItem(THEME_KEY);
  return raw === "light" ? "light" : "dark";
}

function readStoredLocale(): Locale {
  const raw = localStorage.getItem(LOCALE_KEY);
  return raw === "en" ? "en" : "zh";
}

function readStoredDisplayPrefs(): DisplayPrefs {
  try {
    const raw = localStorage.getItem(DISPLAY_PREFS_KEY);
    if (!raw) return structuredClone(DEFAULT_DISPLAY_PREFS);
    const parsed = JSON.parse(raw) as Partial<DisplayPrefs>;
    return {
      sidebar: { ...DEFAULT_DISPLAY_PREFS.sidebar, ...parsed.sidebar },
      explorer: { ...DEFAULT_DISPLAY_PREFS.explorer, ...parsed.explorer },
      aiPanel: typeof parsed.aiPanel === "boolean" ? parsed.aiPanel : DEFAULT_DISPLAY_PREFS.aiPanel,
    };
  } catch {
    return structuredClone(DEFAULT_DISPLAY_PREFS);
  }
}

/** 把主题写到 <html data-theme>，供全局 CSS 变量切换。 */
export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

export function applyLocale(locale: Locale) {
  document.documentElement.setAttribute("lang", locale === "zh" ? "zh-CN" : "en");
}

/**
 * 同步原生窗口/应用主题（标题栏等）。
 * 在非 Tauri 环境（纯浏览器预览）下忽略失败。
 */
export async function syncTauriTheme(mode: ThemeMode) {
  try {
    await setTauriTheme(mode);
  } catch {
    // vite-only / 无权限时静默跳过
  }
}

export const useUiStore = defineStore("ui", () => {
  const theme = ref<ThemeMode>(readStoredTheme());
  const locale = ref<Locale>(readStoredLocale());
  const displayPrefs = reactive<DisplayPrefs>(readStoredDisplayPrefs());
  const sidebarCollapsed = ref(false);
  const aiCollapsed = ref(false);
  const aiPanelWidth = ref(readStoredAiPanelWidth());
  const sidebarWidth = ref(readStoredSidebarWidth());
  const hostsModalOpen = ref(false);
  const connectModalOpen = ref(false);
  const aiSettingsModalOpen = ref(false);
  const displaySettingsModalOpen = ref(false);
  const terminalSettingsModalOpen = ref(false);
  /** 编辑时带入；新增时为 null */
  const editingHost = ref<HostRecord | null>(null);

  applyTheme(theme.value);
  applyLocale(locale.value);
  void syncTauriTheme(theme.value);

  watch(theme, (mode) => {
    applyTheme(mode);
    localStorage.setItem(THEME_KEY, mode);
    void syncTauriTheme(mode);
  });

  watch(locale, (value) => {
    applyLocale(value);
    localStorage.setItem(LOCALE_KEY, value);
  });

  watch(
    displayPrefs,
    (value) => {
      localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(value));
    },
    { deep: true }
  );

  function setTheme(mode: ThemeMode) {
    theme.value = mode;
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  function setLocale(value: Locale) {
    locale.value = value;
  }

  function toggleLocale() {
    locale.value = locale.value === "zh" ? "en" : "zh";
  }

  watch(aiPanelWidth, (value) => {
    localStorage.setItem(AI_PANEL_WIDTH_KEY, String(value));
  });

  watch(sidebarWidth, (value) => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(value));
  });

  function setAiPanelWidth(value: number) {
    aiPanelWidth.value = clampAiPanelWidth(value);
  }

  function setSidebarWidth(value: number) {
    sidebarWidth.value = clampSidebarWidth(value);
  }

  function openHostsModal() {
    hostsModalOpen.value = true;
  }

  function closeHostsModal() {
    hostsModalOpen.value = false;
  }

  function openConnectModal(host: HostRecord | null = null) {
    editingHost.value = host;
    connectModalOpen.value = true;
  }

  function closeConnectModal() {
    connectModalOpen.value = false;
    editingHost.value = null;
  }

  function openAiSettingsModal() {
    aiSettingsModalOpen.value = true;
  }

  function closeAiSettingsModal() {
    aiSettingsModalOpen.value = false;
  }

  function openDisplaySettingsModal() {
    displaySettingsModalOpen.value = true;
  }

  function closeDisplaySettingsModal() {
    displaySettingsModalOpen.value = false;
  }

  function openTerminalSettingsModal() {
    terminalSettingsModalOpen.value = true;
  }

  function closeTerminalSettingsModal() {
    terminalSettingsModalOpen.value = false;
  }

  function resetDisplayPrefs() {
    Object.assign(displayPrefs.sidebar, DEFAULT_DISPLAY_PREFS.sidebar);
    Object.assign(displayPrefs.explorer, DEFAULT_DISPLAY_PREFS.explorer);
    displayPrefs.aiPanel = DEFAULT_DISPLAY_PREFS.aiPanel;
  }

  return {
    theme,
    locale,
    displayPrefs,
    sidebarCollapsed,
    aiCollapsed,
    aiPanelWidth,
    sidebarWidth,
    hostsModalOpen,
    connectModalOpen,
    aiSettingsModalOpen,
    displaySettingsModalOpen,
    terminalSettingsModalOpen,
    editingHost,
    setTheme,
    toggleTheme,
    setLocale,
    toggleLocale,
    setAiPanelWidth,
    setSidebarWidth,
    openHostsModal,
    closeHostsModal,
    openConnectModal,
    closeConnectModal,
    openAiSettingsModal,
    closeAiSettingsModal,
    openDisplaySettingsModal,
    closeDisplaySettingsModal,
    openTerminalSettingsModal,
    closeTerminalSettingsModal,
    resetDisplayPrefs,
  };
});
