/**
 * Remote note / feature flags from `VITE_NOTE_URL`.
 * Controls in-app announcement modal, AI chat availability, and DevTools.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import * as api from "../api/tauri";
import type { NoteConfig } from "../types/note";

const DISMISSED_KEY = "peekshell.note.dismissedFingerprint";

function fingerprint(config: NoteConfig): string {
  return [config.version, config.pub_date, config.openUrl, config.zh?.note ?? ""].join("\0");
}

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeDismissed(value: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // ignore quota / private mode
  }
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normalize loose JSON into a typed config; ignore unknown / malformed fields. */
function parseNoteConfig(raw: unknown): NoteConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const zhRaw = o.zh && typeof o.zh === "object" ? (o.zh as Record<string, unknown>) : {};
  return {
    version: asString(o.version),
    show: asBool(o.show, false),
    webShow: asBool(o.webShow, false),
    appShow: asBool(o.appShow, false),
    pub_date: asString(o.pub_date),
    openUrl: asString(o.openUrl),
    repeatShow: asBool(o.repeatShow, true),
    login: asBool(o.login, false),
    register: asBool(o.register, false),
    search: asBool(o.search, false),
    learn: asBool(o.learn, false),
    aichat: asBool(o.aichat, true),
    aipage: asBool(o.aipage, false),
    rightBtn: asBool(o.rightBtn, false),
    devtools: asBool(o.devtools, false),
    payMethods: Array.isArray(o.payMethods)
      ? o.payMethods.filter((x): x is string => typeof x === "string")
      : [],
    zh: {
      note: asString(zhRaw.note),
      always: asString(zhRaw.always),
      contact: asString(zhRaw.contact),
    },
  };
}

export const useNoteStore = defineStore("note", () => {
  const config = ref<NoteConfig | null>(null);
  const loaded = ref(false);
  const modalOpen = ref(false);

  /** Remote kill-switch for AI chat / Assist panel. Defaults on until config loads. */
  const aiChatEnabled = computed(() => config.value?.aichat ?? true);

  /** Remote flag for WebView DevTools (About logo ×3). Defaults off. */
  const devtoolsEnabled = computed(() => config.value?.devtools ?? false);

  const noteText = computed(() => (config.value?.zh?.note ?? "").trim());

  const openUrlTarget = computed(() => (config.value?.openUrl ?? "").trim());

  function shouldShowModal(next: NoteConfig): boolean {
    if (!next.show || !next.appShow) return false;
    const text = (next.zh?.note ?? "").trim();
    if (!text) return false;
    if (next.repeatShow) return true;
    return fingerprint(next) !== readDismissed();
  }

  async function refresh() {
    const url = import.meta.env.VITE_NOTE_URL?.trim();
    if (!url) {
      loaded.value = true;
      return;
    }
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`note fetch ${res.status}`);
      const parsed = parseNoteConfig(await res.json());
      config.value = parsed;
      if (parsed && shouldShowModal(parsed)) {
        modalOpen.value = true;
      }
    } catch {
      // Offline / bad JSON: keep defaults so local AI still works.
      config.value = null;
    } finally {
      loaded.value = true;
    }
  }

  function dismiss() {
    const current = config.value;
    if (current && !current.repeatShow) {
      writeDismissed(fingerprint(current));
    }
    modalOpen.value = false;
  }

  /** Confirm: open `openUrl` when set, then close the modal. */
  async function confirm() {
    const url = openUrlTarget.value;
    dismiss();
    if (!url) return;
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  /** Open WebView DevTools only when remote `devtools` is enabled. */
  async function tryOpenDevtools() {
    if (!devtoolsEnabled.value) return;
    try {
      await api.openDevtools();
    } catch {
      // Non-Tauri preview or feature unavailable
    }
  }

  return {
    config,
    loaded,
    modalOpen,
    aiChatEnabled,
    devtoolsEnabled,
    noteText,
    openUrlTarget,
    refresh,
    dismiss,
    confirm,
    tryOpenDevtools,
  };
});
