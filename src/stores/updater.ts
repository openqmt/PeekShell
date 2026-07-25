/**
 * App updater: check remote manifest via Tauri updater plugin,
 * prompt when versions differ, then download / install / relaunch.
 * Custom manifest fields: `force`, `zh`, `en` (via Update.rawJson).
 */
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { defineStore } from "pinia";
import { ref } from "vue";
import { useNoteStore } from "./note";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const useUpdaterStore = defineStore("updater", () => {
  const modalOpen = ref(false);
  const force = ref(false);
  const remoteVersion = ref("");
  const notesZh = ref("");
  const notesEn = ref("");
  const installing = ref(false);
  /** Download percent string e.g. `42.50`, empty until Progress. */
  const progressPercent = ref("");
  const error = ref(false);

  let pending: Update | null = null;

  async function refresh() {
    try {
      const update = await check();
      if (!update) return;
      // check() already filters by semver; still guard identical strings
      if (update.version === update.currentVersion) {
        await update.close();
        return;
      }

      const raw = update.rawJson;
      pending = update;
      remoteVersion.value = update.version;
      force.value = raw.force === true;
      notesZh.value = asString(raw.zh);
      notesEn.value = asString(raw.en);
      if (!notesZh.value && !notesEn.value && update.body) {
        notesZh.value = update.body;
        notesEn.value = update.body;
      }
      progressPercent.value = "";
      error.value = false;
      installing.value = false;
      // Upgrade takes priority over announcement note
      useNoteStore().hideTemporarily();
      modalOpen.value = true;
    } catch {
      // Offline / non-Tauri preview: skip silently
    }
  }

  /** Non-force dismiss only; ignore while installing. */
  function dismiss() {
    if (force.value || installing.value) return;
    modalOpen.value = false;
    void pending?.close();
    pending = null;
    useNoteStore().offerModalIfNeeded();
  }

  async function upgrade() {
    if (!pending || installing.value) return;
    installing.value = true;
    error.value = false;
    progressPercent.value = "0.00";

    let downloaded = 0;
    let contentLength = 0;

    try {
      await pending.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              progressPercent.value = ((downloaded / contentLength) * 100).toFixed(2);
            }
            break;
          case "Finished":
            progressPercent.value = "100.00";
            break;
        }
      });
      await relaunch();
    } catch {
      error.value = true;
      installing.value = false;
    }
  }

  return {
    modalOpen,
    force,
    remoteVersion,
    notesZh,
    notesEn,
    installing,
    progressPercent,
    error,
    refresh,
    dismiss,
    upgrade,
  };
});
