/** 侧栏折叠、主题、语言与弹窗显隐等纯 UI 状态。 */
import { setTheme as setTauriTheme } from "@tauri-apps/api/app";
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Locale } from "../i18n/messages";
import type { HostRecord } from "../types/host";

export type ThemeMode = "dark" | "light";

const THEME_KEY = "peekshell.theme";
const LOCALE_KEY = "peekshell.locale";

function readStoredTheme(): ThemeMode {
  const raw = localStorage.getItem(THEME_KEY);
  return raw === "light" ? "light" : "dark";
}

function readStoredLocale(): Locale {
  const raw = localStorage.getItem(LOCALE_KEY);
  return raw === "en" ? "en" : "zh";
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
  const sidebarCollapsed = ref(false);
  const aiCollapsed = ref(false);
  const hostsModalOpen = ref(false);
  const connectModalOpen = ref(false);
  const aiSettingsModalOpen = ref(false);
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

  return {
    theme,
    locale,
    sidebarCollapsed,
    aiCollapsed,
    hostsModalOpen,
    connectModalOpen,
    aiSettingsModalOpen,
    editingHost,
    setTheme,
    toggleTheme,
    setLocale,
    toggleLocale,
    openHostsModal,
    closeHostsModal,
    openConnectModal,
    closeConnectModal,
    openAiSettingsModal,
    closeAiSettingsModal,
  };
});
