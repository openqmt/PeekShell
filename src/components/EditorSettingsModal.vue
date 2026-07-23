<script setup lang="ts">
/**
 * 预览编辑器更多设置：主题、字体、字号。
 */
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useI18n } from "../i18n";
import {
  clampEditorFontSize,
  EDITOR_FONT_SIZE_PRESETS,
  useEditorPrefsStore,
} from "../stores/editorPrefs";
import { FONT_PRESETS } from "../stores/terminalPrefs";
import { useUiStore } from "../stores/ui";
import AppSelect from "./AppSelect.vue";

const ui = useUiStore();
const editorPrefs = useEditorPrefsStore();
const { t } = useI18n();
const { prefs } = storeToRefs(editorPrefs);

const colorSchemeOptions = computed(() => [
  { value: "theme", label: t("editorSettings.schemeTheme") },
  { value: "dark", label: t("editorSettings.schemeDark") },
  { value: "light", label: t("editorSettings.schemeLight") },
]);

const fontFamilyOptions = computed(() =>
  FONT_PRESETS.map((font) => ({
    value: font,
    label: font.split(",")[0]!.trim(),
  }))
);

const fontSizeOptions = computed(() =>
  EDITOR_FONT_SIZE_PRESETS.map((size) => ({
    value: String(size),
    label: String(size),
  }))
);

const fontSizeModel = ref(String(prefs.value.fontSize));

watch(
  () => prefs.value.fontSize,
  (n) => {
    fontSizeModel.value = String(n);
  }
);

function onFontSizeChange(value: string) {
  const next = clampEditorFontSize(Number(value));
  prefs.value.fontSize = next;
  fontSizeModel.value = String(next);
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) ui.closeEditorSettingsModal();
}
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal sm" role="dialog" aria-labelledby="editorSettingsTitle">
      <div class="modal-head">
        <div>
          <h2 id="editorSettingsTitle">{{ t("editorSettings.title") }}</h2>
          <div class="sub">{{ t("editorSettings.sub") }}</div>
        </div>
        <button
          type="button"
          class="icon-btn"
          :aria-label="t('common.close')"
          @click="ui.closeEditorSettingsModal()"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <label class="field">
          <span>{{ t("editorSettings.theme") }}</span>
          <AppSelect v-model="prefs.colorScheme" :options="colorSchemeOptions" />
        </label>
        <label class="field">
          <span>{{ t("editorSettings.fontFamily") }}</span>
          <AppSelect v-model="prefs.fontFamily" :options="fontFamilyOptions" />
        </label>
        <label class="field">
          <span>{{ t("editorSettings.fontSize") }}</span>
          <AppSelect
            :model-value="fontSizeModel"
            :options="fontSizeOptions"
            @update:model-value="onFontSizeChange"
          />
        </label>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn ghost md" @click="editorPrefs.reset()">
          {{ t("editorSettings.reset") }}
        </button>
        <span class="foot-spacer" />
        <button type="button" class="btn primary md" @click="ui.closeEditorSettingsModal()">
          {{ t("common.close") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal.sm {
  width: min(420px, 100%);
}

.modal :deep(.modal-head) {
  padding: 10px 12px;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.field :deep(.app-select-trigger) {
  min-height: 30px;
  height: 30px;
}

.modal-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-soft);
}

.foot-spacer {
  flex: 1;
}
</style>
