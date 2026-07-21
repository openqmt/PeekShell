import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { applyTheme } from "./stores/ui";
import "./styles/app.css";

// 首屏前应用主题，避免闪一下错误配色
const stored = localStorage.getItem("peekshell.theme");
applyTheme(stored === "light" ? "light" : "dark");

createApp(App).use(createPinia()).mount("#app");
