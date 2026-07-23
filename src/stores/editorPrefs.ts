/** 远端文件预览编辑器外观偏好（localStorage 持久化）。 */
import { defineStore } from "pinia";
import { reactive, watch } from "vue";
import { FONT_PRESETS } from "./terminalPrefs";

export type EditorColorScheme = "theme" | "dark" | "light";

export interface EditorPrefs {
  colorScheme: EditorColorScheme;
  fontFamily: string;
  fontSize: number;
}

const PREFS_KEY = "peekshell.editorPrefs";

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  colorScheme: "theme",
  fontFamily: FONT_PRESETS[0],
  fontSize: 12,
};

export const EDITOR_FONT_SIZE_PRESETS = [
  10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24,
] as const;

export function clampEditorFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EDITOR_PREFS.fontSize;
  return Math.min(24, Math.max(10, Math.round(value)));
}

function readStoredPrefs(): EditorPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return structuredClone(DEFAULT_EDITOR_PREFS);
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>;
    const fontFamily =
      typeof parsed.fontFamily === "string" && parsed.fontFamily.trim()
        ? parsed.fontFamily
        : DEFAULT_EDITOR_PREFS.fontFamily;
    const colorScheme =
      parsed.colorScheme === "dark" || parsed.colorScheme === "light" || parsed.colorScheme === "theme"
        ? parsed.colorScheme
        : DEFAULT_EDITOR_PREFS.colorScheme;
    return {
      colorScheme,
      fontFamily,
      fontSize:
        typeof parsed.fontSize === "number" && parsed.fontSize > 0
          ? clampEditorFontSize(parsed.fontSize)
          : DEFAULT_EDITOR_PREFS.fontSize,
    };
  } catch {
    return structuredClone(DEFAULT_EDITOR_PREFS);
  }
}

export const useEditorPrefsStore = defineStore("editorPrefs", () => {
  const prefs = reactive<EditorPrefs>(readStoredPrefs());

  watch(
    prefs,
    (value) => {
      localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    },
    { deep: true }
  );

  function reset() {
    const next = structuredClone(DEFAULT_EDITOR_PREFS);
    prefs.colorScheme = next.colorScheme;
    prefs.fontFamily = next.fontFamily;
    prefs.fontSize = next.fontSize;
  }

  return { prefs, reset };
});
