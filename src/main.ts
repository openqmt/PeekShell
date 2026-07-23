import { createPinia } from "pinia";
import { createApp } from "vue";
import { createGtag } from "vue-gtag";
import App from "./App.vue";
import { installDisableBrowserFind } from "./disableBrowserFind";
import { installDisableNativeInputHints } from "./disableNativeInputHints";
import { applyAccentColor, applyLocale, applyTheme, normalizeAccentColor } from "./stores/ui";
import "./styles/app.css";

// 首屏前应用主题与语言，避免闪一下错误配色/文案
const storedTheme = localStorage.getItem("peekshell.theme");
applyTheme(storedTheme === "light" ? "light" : "dark");
const storedLocale = localStorage.getItem("peekshell.locale");
applyLocale(storedLocale === "en" ? "en" : "zh");
try {
  const raw = localStorage.getItem("peekshell.displayPrefs");
  if (raw) {
    const parsed = JSON.parse(raw) as { accentColor?: unknown };
    applyAccentColor(normalizeAccentColor(parsed.accentColor));
  }
} catch {
  // ignore corrupt prefs
}

const app = createApp(App).use(createPinia());

const gtagId = import.meta.env.VITE_GTAG_ID;
if (gtagId) {
  app.use(
    createGtag({
      tagId: gtagId,
    }),
  );
}

app.mount("#app");
// WebKit/macOS: turn off system autocomplete / autocorrect on all text fields
installDisableNativeInputHints();
// Block WebView Find (Ctrl/Cmd+F, F3); terminal + file preview keep their own find
installDisableBrowserFind();
