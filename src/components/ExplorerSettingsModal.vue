<script setup lang="ts">
/**
 * Explorer more settings: preview size limit and tree kind display mode.
 */
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useI18n } from "../i18n";
import {
  clampPreviewMaxKb,
  PREVIEW_MAX_KB_PRESETS,
  useExplorerPrefsStore,
} from "../stores/explorerPrefs";
import { useUiStore } from "../stores/ui";
import AppSelect from "./AppSelect.vue";

const ui = useUiStore();
const explorerPrefs = useExplorerPrefsStore();
const { t } = useI18n();
const { prefs } = storeToRefs(explorerPrefs);

const previewMaxOptions = computed(() =>
  PREVIEW_MAX_KB_PRESETS.map((kb) => ({
    value: String(kb),
    label: kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`,
  }))
);

const kindDisplayOptions = computed(() => [
  { value: "text", label: t("explorerSettings.kindText") },
  { value: "icon", label: t("explorerSettings.kindIcon") },
  { value: "image", label: t("explorerSettings.kindImage") },
]);

const previewMaxModel = ref(String(prefs.value.previewMaxKb));

watch(
  () => prefs.value.previewMaxKb,
  (n) => {
    previewMaxModel.value = String(n);
  }
);

function onPreviewMaxChange(value: string) {
  const next = clampPreviewMaxKb(Number(value));
  prefs.value.previewMaxKb = next;
  previewMaxModel.value = String(next);
}

function onKindDisplayChange(value: string) {
  prefs.value.kindDisplay =
    value === "icon" || value === "image" || value === "text" ? value : "text";
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) ui.closeExplorerSettingsModal();
}
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal sm" role="dialog" aria-labelledby="explorerSettingsTitle">
      <div class="modal-head">
        <div>
          <h2 id="explorerSettingsTitle">{{ t("explorerSettings.title") }}</h2>
          <div class="sub">{{ t("explorerSettings.sub") }}</div>
        </div>
        <button
          type="button"
          class="icon-btn"
          :aria-label="t('common.close')"
          @click="ui.closeExplorerSettingsModal()"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <label class="field">
          <span>{{ t("explorerSettings.previewMax") }}</span>
          <AppSelect
            :model-value="previewMaxModel"
            :options="previewMaxOptions"
            @update:model-value="onPreviewMaxChange"
          />
          <span class="hint">{{ t("explorerSettings.previewMaxHint") }}</span>
        </label>
        <label class="field">
          <span>{{ t("explorerSettings.kindDisplay") }}</span>
          <AppSelect
            :model-value="prefs.kindDisplay"
            :options="kindDisplayOptions"
            @update:model-value="onKindDisplayChange"
          />
          <span class="hint">{{ t("explorerSettings.kindDisplayHint") }}</span>
        </label>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn ghost md" @click="explorerPrefs.reset()">
          {{ t("explorerSettings.reset") }}
        </button>
        <span class="foot-spacer" />
        <button type="button" class="btn primary md" @click="ui.closeExplorerSettingsModal()">
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
  gap: 12px;
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

.hint {
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.35;
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
