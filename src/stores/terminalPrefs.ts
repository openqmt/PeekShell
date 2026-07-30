/** 终端外观与快捷键偏好（localStorage 持久化）。 */
import { defineStore } from "pinia";
import { reactive, watch } from "vue";
import bg1 from "../assets/bgimg/bg1.webp";
import bg2 from "../assets/bgimg/bg2.webp";
import bg3 from "../assets/bgimg/bg3.webp";

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
  /** Toggle terminal AI compose mode (default Ctrl+I). */
  aiChat: string;
}

export interface TerminalPrefs {
  fontFamily: string;
  fontSize: number;
  colorScheme: TermColorScheme;
  customColors: TermCustomColors;
  /**
   * Background image source.
   * Built-in presets use `preset:<id>` so Vite hashed asset URLs survive rebuilds;
   * custom picks may be a data URL, path, or http(s) URL.
   */
  backgroundImage: string;
  /** User-picked wallpapers (usually data URLs) shown after bundled presets. */
  customBackgroundImages: string[];
  backgroundOpacity: number;
  shortcuts: TermShortcuts;
}

const PREFS_KEY = "peekshell.terminalPrefs";
/** One-time: adopt bundled bg1 when upgrading from the legacy empty default. */
const BG_PRESETS_MIGRATED_KEY = "peekshell.terminalBgPresets.v1";
const PRESET_PREFIX = "preset:";

/** Bundled terminal wallpaper options (`src/assets/bgimg`). */
export const BACKGROUND_IMAGE_PRESETS = [
  { id: "bg1", src: bg1 },
  { id: "bg2", src: bg2 },
  { id: "bg3", src: bg3 },
] as const;

export type BackgroundImagePresetId = (typeof BACKGROUND_IMAGE_PRESETS)[number]["id"];

export function presetBackgroundValue(id: BackgroundImagePresetId): string {
  return `${PRESET_PREFIX}${id}`;
}

/** Resolve a stored preference to a CSS-usable image URL (empty = none). */
export function resolveBackgroundImage(stored: string): string {
  const value = stored.trim();
  if (!value) return "";
  if (value.startsWith(PRESET_PREFIX)) {
    const id = value.slice(PRESET_PREFIX.length);
    return BACKGROUND_IMAGE_PRESETS.find((p) => p.id === id)?.src ?? "";
  }
  return value;
}

/** Return preset id when `stored` points at a bundled wallpaper; otherwise null. */
export function backgroundPresetId(stored: string): BackgroundImagePresetId | null {
  const value = stored.trim();
  if (!value.startsWith(PRESET_PREFIX)) return null;
  const id = value.slice(PRESET_PREFIX.length);
  return BACKGROUND_IMAGE_PRESETS.some((p) => p.id === id)
    ? (id as BackgroundImagePresetId)
    : null;
}

export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = {
  fontFamily: "IBM Plex Mono, ui-monospace, monospace",
  fontSize: 13,
  colorScheme: "custom",
  customColors: {
    background: "#0a0d10",
    foreground: "#d6dde6",
    cursor: "#3ecf8e",
  },
  backgroundImage: presetBackgroundValue("bg1"),
  customBackgroundImages: [],
  backgroundOpacity: 0.7,
  shortcuts: {
    copy: "Ctrl+Shift+C",
    paste: "Ctrl+V",
    find: "Ctrl+F",
    clear: "Ctrl+Shift+K",
    newSession: "Ctrl+N",
    closeTab: "Ctrl+W",
    aiChat: "Ctrl+I",
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

function normalizeCustomBackgroundImages(
  parsed: Partial<TerminalPrefs>,
  backgroundImage: string
): string[] {
  const fromStore = Array.isArray(parsed.customBackgroundImages)
    ? parsed.customBackgroundImages.filter(
        (src): src is string => typeof src === "string" && !!src.trim()
      )
    : [];
  // Legacy: a single custom backgroundImage with no gallery entry.
  if (
    backgroundImage.trim() &&
    !backgroundPresetId(backgroundImage) &&
    !fromStore.includes(backgroundImage)
  ) {
    return [backgroundImage, ...fromStore];
  }
  return fromStore;
}

function readStoredPrefs(): TerminalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      localStorage.setItem(BG_PRESETS_MIGRATED_KEY, "1");
      return structuredClone(DEFAULT_TERMINAL_PREFS);
    }
    const parsed = JSON.parse(raw) as Partial<TerminalPrefs>;
    let backgroundImage =
      typeof parsed.backgroundImage === "string"
        ? parsed.backgroundImage
        : DEFAULT_TERMINAL_PREFS.backgroundImage;
    // Upgrade once from legacy empty default → bg1; later explicit "none" stays empty.
    if (!localStorage.getItem(BG_PRESETS_MIGRATED_KEY)) {
      if (!backgroundImage.trim()) {
        backgroundImage = DEFAULT_TERMINAL_PREFS.backgroundImage;
      }
      localStorage.setItem(BG_PRESETS_MIGRATED_KEY, "1");
    }
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
      backgroundImage,
      customBackgroundImages: normalizeCustomBackgroundImages(parsed, backgroundImage),
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
    prefs.customBackgroundImages = next.customBackgroundImages;
    prefs.backgroundOpacity = next.backgroundOpacity;
    Object.assign(prefs.customColors, next.customColors);
    Object.assign(prefs.shortcuts, next.shortcuts);
  }

  return { prefs, reset };
});
