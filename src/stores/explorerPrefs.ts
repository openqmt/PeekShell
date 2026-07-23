/** 远端文件浏览器偏好（预览大小上限、目录树 kind 显示方式）。 */
import { defineStore } from "pinia";
import { reactive, watch } from "vue";

export type ExplorerKindDisplay = "text" | "icon" | "windows" | "macos";

export interface ExplorerPrefs {
  /** Max bytes loaded for in-app file preview (default 512 KiB). */
  previewMaxKb: number;
  /** Left tree kind column: DIR/FILE text, outline icons, Windows, or macOS icons. */
  kindDisplay: ExplorerKindDisplay;
}

const PREFS_KEY = "peekshell.explorerPrefs";

export const DEFAULT_EXPLORER_PREFS: ExplorerPrefs = {
  previewMaxKb: 512,
  kindDisplay: "text",
};

/** Presets shown in the settings modal (KiB). */
export const PREVIEW_MAX_KB_PRESETS = [128, 256, 512, 1024, 2048, 4096] as const;

export const PREVIEW_MAX_KB_MIN = 64;
export const PREVIEW_MAX_KB_MAX = 8192;

export function clampPreviewMaxKb(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EXPLORER_PREFS.previewMaxKb;
  return Math.min(PREVIEW_MAX_KB_MAX, Math.max(PREVIEW_MAX_KB_MIN, Math.round(value)));
}

export function previewMaxBytes(prefs: Pick<ExplorerPrefs, "previewMaxKb">): number {
  return clampPreviewMaxKb(prefs.previewMaxKb) * 1024;
}

function normalizeKindDisplay(value: unknown): ExplorerKindDisplay {
  // Migrate legacy "image" label → Windows-style icons.
  if (value === "image" || value === "windows") return "windows";
  if (value === "macos" || value === "icon" || value === "text") return value;
  return DEFAULT_EXPLORER_PREFS.kindDisplay;
}

function readStoredPrefs(): ExplorerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return structuredClone(DEFAULT_EXPLORER_PREFS);
    const parsed = JSON.parse(raw) as Partial<ExplorerPrefs>;
    return {
      previewMaxKb:
        typeof parsed.previewMaxKb === "number"
          ? clampPreviewMaxKb(parsed.previewMaxKb)
          : DEFAULT_EXPLORER_PREFS.previewMaxKb,
      kindDisplay: normalizeKindDisplay(parsed.kindDisplay),
    };
  } catch {
    return structuredClone(DEFAULT_EXPLORER_PREFS);
  }
}

export const useExplorerPrefsStore = defineStore("explorerPrefs", () => {
  const prefs = reactive<ExplorerPrefs>(readStoredPrefs());

  watch(
    prefs,
    (value) => {
      localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    },
    { deep: true }
  );

  function reset() {
    const next = structuredClone(DEFAULT_EXPLORER_PREFS);
    prefs.previewMaxKb = next.previewMaxKb;
    prefs.kindDisplay = next.kindDisplay;
  }

  return { prefs, reset };
});
