<script setup lang="ts">
/** 界面显示设置：控制侧栏、资源管理器列与 AI 面板显隐。 */
import { storeToRefs } from "pinia";
import { useI18n } from "../i18n";
import { useUiStore } from "../stores/ui";

const ui = useUiStore();
const { t } = useI18n();
const { displayPrefs } = storeToRefs(ui);

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) ui.closeDisplaySettingsModal();
}
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal sm" role="dialog" aria-labelledby="displaySettingsTitle">
      <div class="modal-head">
        <div>
          <h2 id="displaySettingsTitle">{{ t("displaySettings.title") }}</h2>
          <div class="sub">{{ t("displaySettings.sub") }}</div>
        </div>
        <button
          type="button"
          class="icon-btn"
          :aria-label="t('common.close')"
          @click="ui.closeDisplaySettingsModal()"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <div class="section-label">{{ t("displaySettings.sidebarSection") }}</div>
        <div class="check-grid">
          <label class="check">
            <input v-model="displayPrefs.sidebar.system" type="checkbox" />
            <span>{{ t("displaySettings.sidebarSystem") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.sidebar.resources" type="checkbox" />
            <span>{{ t("displaySettings.sidebarResources") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.sidebar.processes" type="checkbox" />
            <span>{{ t("displaySettings.sidebarProcesses") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.sidebar.network" type="checkbox" />
            <span>{{ t("displaySettings.sidebarNetwork") }}</span>
          </label>
        </div>

        <div class="section-label">{{ t("displaySettings.coreSection") }}</div>
        <div class="check-grid">
          <label class="check">
            <input v-model="displayPrefs.explorer.show" type="checkbox" />
            <span>{{ t("displaySettings.explorer") }}</span>
          </label>
        </div>
        <div class="section-hint">{{ t("displaySettings.attrColumns") }}</div>
        <div class="check-grid nested">
          <label class="check">
            <input v-model="displayPrefs.explorer.colName" type="checkbox" />
            <span>{{ t("explorer.colName") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colSize" type="checkbox" />
            <span>{{ t("explorer.colSize") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colType" type="checkbox" />
            <span>{{ t("explorer.colType") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colModified" type="checkbox" />
            <span>{{ t("explorer.colModified") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colPermissions" type="checkbox" />
            <span>{{ t("explorer.colPermissions") }}</span>
          </label>
          <label class="check">
            <input v-model="displayPrefs.explorer.colGroup" type="checkbox" />
            <span>{{ t("explorer.colGroup") }}</span>
          </label>
        </div>

        <div class="section-label">{{ t("displaySettings.aiSection") }}</div>
        <div class="check-grid">
          <label class="check">
            <input v-model="displayPrefs.aiPanel" type="checkbox" />
            <span>{{ t("displaySettings.aiPanel") }}</span>
          </label>
        </div>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn ghost md" @click="ui.resetDisplayPrefs()">
          {{ t("displaySettings.reset") }}
        </button>
        <span class="foot-spacer" />
        <button type="button" class="btn primary md" @click="ui.closeDisplaySettingsModal()">
          {{ t("common.close") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.check-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin-bottom: 16px;
}

.check-grid.nested {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: var(--bg-elevated);
}

.section-hint {
  font-size: 11px;
  color: var(--text-dim);
  margin: -6px 0 0;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}

.check input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
  cursor: pointer;
}

.foot-spacer {
  flex: 1;
}
</style>
