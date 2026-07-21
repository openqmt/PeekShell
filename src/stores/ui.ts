/** 侧栏折叠、主题与弹窗显隐等纯 UI 状态。 */
import { setTheme as setTauriTheme } from "@tauri-apps/api/app";
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { HostRecord } from "../types/host";

export type ThemeMode = "dark" | "light";

const THEME_KEY = "peekshell.theme";

function readStoredTheme(): ThemeMode {
  const raw = localStorage.getItem(THEME_KEY);
  return raw === "light" ? "light" : "dark";
}

/** 把主题写到 <html data-theme>，供全局 CSS 变量切换。 */
export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
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
  const sidebarCollapsed = ref(false);
  const aiCollapsed = ref(false);
  const hostsModalOpen = ref(false);
  const connectModalOpen = ref(false);
  const aiSettingsModalOpen = ref(false);
  /** 编辑时带入；新增时为 null */
  const editingHost = ref<HostRecord | null>(null);

  applyTheme(theme.value);
  void syncTauriTheme(theme.value);

  watch(theme, (mode) => {
    applyTheme(mode);
    localStorage.setItem(THEME_KEY, mode);
    void syncTauriTheme(mode);
  });

  function setTheme(mode: ThemeMode) {
    theme.value = mode;
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
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
    sidebarCollapsed,
    aiCollapsed,
    hostsModalOpen,
    connectModalOpen,
    aiSettingsModalOpen,
    editingHost,
    setTheme,
    toggleTheme,
    openHostsModal,
    closeHostsModal,
    openConnectModal,
    closeConnectModal,
    openAiSettingsModal,
    closeAiSettingsModal,
  };
});
