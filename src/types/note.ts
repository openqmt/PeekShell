/** Remote announcement / feature-flag payload from `VITE_NOTE_URL`. */
export interface NoteLocaleCopy {
  note: string;
  always?: string;
  contact?: string;
}

export interface NoteConfig {
  version: string;
  show: boolean;
  webShow: boolean;
  appShow: boolean;
  pub_date: string;
  openUrl: string;
  repeatShow: boolean;
  login: boolean;
  register: boolean;
  search: boolean;
  learn: boolean;
  aichat: boolean;
  aipage: boolean;
  rightBtn: boolean;
  devtools: boolean;
  payMethods: string[];
  zh: NoteLocaleCopy;
}
