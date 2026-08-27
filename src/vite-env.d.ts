/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GTAG_ID?: string;
  readonly VITE_NOTE_URL?: string;
  readonly VITE_BASE_URL?: string;
  readonly VITE_SECRET_KEY?: string;
  readonly VITE_UPDATE_URL?: string;
  readonly VITE_CLOUD_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
