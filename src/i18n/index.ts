import { storeToRefs } from "pinia";
import { useUiStore } from "../stores/ui";
import { messages, type MessageKey, UNGROUPED_GROUP } from "./messages";

export type { Locale, MessageKey } from "./messages";
export { UNGROUPED_GROUP, messages } from "./messages";

export function useI18n() {
  const ui = useUiStore();
  const { locale } = storeToRefs(ui);

  function t(key: MessageKey, params?: Record<string, string | number>) {
    const table = messages[locale.value] ?? messages.zh;
    let text: string = table[key] ?? messages.zh[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  }

  function groupLabel(group: string) {
    return group === UNGROUPED_GROUP ? t("common.ungrouped") : group;
  }

  return { t, locale, setLocale: ui.setLocale, toggleLocale: ui.toggleLocale, groupLabel };
}
