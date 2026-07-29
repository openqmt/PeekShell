import { createPinia } from "pinia";
import { createApp } from "vue";
import { createGtag } from "vue-gtag";
import App from "./App.vue";
import {
  applyAccentColor,
  applyLocale,
  applyTheme,
  normalizeAccentColor,
  resolveInitialLocale,
} from "./stores/ui";
import { installWebViewGuards } from "./utils/installWebViewGuards";
import "./styles/app.css";

// 首屏前应用主题与语言，避免闪一下错误配色/文案
const storedTheme = localStorage.getItem("peekshell.theme");
applyTheme(storedTheme === "light" ? "light" : "dark");
applyLocale(resolveInitialLocale());
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
installWebViewGuards();
