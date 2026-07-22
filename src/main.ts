import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { installDisableNativeInputHints } from "./disableNativeInputHints";
import { applyLocale, applyTheme } from "./stores/ui";
import "./styles/app.css";

// 首屏前应用主题与语言，避免闪一下错误配色/文案
const storedTheme = localStorage.getItem("peekshell.theme");
applyTheme(storedTheme === "light" ? "light" : "dark");
const storedLocale = localStorage.getItem("peekshell.locale");
applyLocale(storedLocale === "en" ? "en" : "zh");

createApp(App).use(createPinia()).mount("#app");
// WebKit/macOS: turn off system autocomplete / autocorrect on all text fields
installDisableNativeInputHints();
