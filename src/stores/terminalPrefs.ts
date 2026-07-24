/** 终端外观与快捷键偏好（localStorage 持久化）。 */
import { defineStore } from "pinia";
import { reactive, watch } from "vue";

export type TermColorScheme = "theme" | "dark" | "light" | "custom";

export interface TermCustomColors {
  background: string;
  foreground: string;
  cursor: string;
}

export interface TermShortcuts {
  copy: string;
  paste: string;
  find: string;
  clear: string;
  newSession: string;
  closeTab: string;
}

export interface TerminalPrefs {
  fontFamily: string;
  fontSize: number;
  colorScheme: TermColorScheme;
  customColors: TermCustomColors;
  backgroundImage: string;
  backgroundOpacity: number;
  shortcuts: TermShortcuts;
}

const PREFS_KEY = "peekshell.terminalPrefs";

export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = {
  fontFamily: "IBM Plex Mono, ui-monospace, monospace",
  fontSize: 13,
  colorScheme: "theme",
  customColors: {
    background: "#0a0d10",
    foreground: "#d6dde6",
    cursor: "#3ecf8e",
  },
  backgroundImage: "",
  backgroundOpacity: 0.7,
  shortcuts: {
    copy: "Ctrl+Shift+C",
    paste: "Ctrl+V",
    find: "Ctrl+F",
    clear: "Ctrl+Shift+K",
    newSession: "Ctrl+N",
    closeTab: "Ctrl+W",
  },
};

export const FONT_PRESETS = [
  "IBM Plex Mono, ui-monospace, monospace",
  "Cascadia Code, Consolas, monospace",
  "JetBrains Mono, ui-monospace, monospace",
  "Fira Code, ui-monospace, monospace",
  "Consolas, Monaco, monospace",
  "Courier New, monospace",
] as const;

/** Common terminal font sizes shown in the settings dropdown. */
export const FONT_SIZE_PRESETS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32] as const;

export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TERMINAL_PREFS.fontSize;
  return Math.min(32, Math.max(10, Math.round(value)));
}

function readStoredPrefs(): TerminalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return structuredClone(DEFAULT_TERMINAL_PREFS);
    const parsed = JSON.parse(raw) as Partial<TerminalPrefs>;
    return {
      ...structuredClone(DEFAULT_TERMINAL_PREFS),
      ...parsed,
      customColors: {
        ...DEFAULT_TERMINAL_PREFS.customColors,
        ...parsed.customColors,
      },
      shortcuts: {
        ...DEFAULT_TERMINAL_PREFS.shortcuts,
        ...parsed.shortcuts,
      },
      fontSize:
        typeof parsed.fontSize === "number" && parsed.fontSize > 0
          ? clampFontSize(parsed.fontSize)
          : DEFAULT_TERMINAL_PREFS.fontSize,
      backgroundOpacity:
        typeof parsed.backgroundOpacity === "number"
          ? Math.min(1, Math.max(0, parsed.backgroundOpacity))
          : DEFAULT_TERMINAL_PREFS.backgroundOpacity,
    };
  } catch {
    return structuredClone(DEFAULT_TERMINAL_PREFS);
  }
}

/** Match keydown against a "Ctrl+Shift+C" style combo. Ctrl also accepts Meta (Cmd). */
export function matchShortcut(ev: KeyboardEvent, combo: string): boolean {
  const parts = combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return false;

  const needCtrl = parts.includes("ctrl") || parts.includes("control");
  const needMeta = parts.includes("meta") || parts.includes("cmd") || parts.includes("command");
  const needAlt = parts.includes("alt") || parts.includes("option");
  const needShift = parts.includes("shift");
  const keyPart = parts.find(
    (p) => !["ctrl", "control", "meta", "cmd", "command", "alt", "option", "shift"].includes(p)
  );
  if (!keyPart) return false;

  const ctrlOrMeta = ev.ctrlKey || ev.metaKey;
  if (needCtrl || needMeta) {
    if (!ctrlOrMeta) return false;
  } else if (ctrlOrMeta) {
    return false;
  }
  if (needAlt !== ev.altKey) return false;
  if (needShift !== ev.shiftKey) return false;

  return ev.key.toLowerCase() === keyPart.toLowerCase();
}

export const useTerminalPrefsStore = defineStore("terminalPrefs", () => {
  const prefs = reactive<TerminalPrefs>(readStoredPrefs());

  watch(
    prefs,
    (value) => {
      localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    },
    { deep: true }
  );

  function reset() {
    const next = structuredClone(DEFAULT_TERMINAL_PREFS);
    prefs.fontFamily = next.fontFamily;
    prefs.fontSize = next.fontSize;
    prefs.colorScheme = next.colorScheme;
    prefs.backgroundImage = next.backgroundImage;
    prefs.backgroundOpacity = next.backgroundOpacity;
    Object.assign(prefs.customColors, next.customColors);
    Object.assign(prefs.shortcuts, next.shortcuts);
  }

  return { prefs, reset };
});
