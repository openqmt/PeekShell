<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted } from "vue";
import AiPanel from "./components/AiPanel.vue";
import AiSettingsModal from "./components/AiSettingsModal.vue";
import ConnectModal from "./components/ConnectModal.vue";
import DisplaySettingsModal from "./components/DisplaySettingsModal.vue";
import HostListModal from "./components/HostListModal.vue";
import HostSidebar from "./components/HostSidebar.vue";
import TerminalPanel from "./components/TerminalPanel.vue";
import TerminalSettingsModal from "./components/TerminalSettingsModal.vue";
import { useAiStore } from "./stores/ai";
import { useHostsStore } from "./stores/hosts";
import { useUiStore } from "./stores/ui";

const ai = useAiStore();
const hosts = useHostsStore();
const ui = useUiStore();
const {
  sidebarCollapsed,
  aiCollapsed,
  aiPanelWidth,
  sidebarWidth,
  hostsModalOpen,
  connectModalOpen,
  aiSettingsModalOpen,
  displaySettingsModalOpen,
  terminalSettingsModalOpen,
  displayPrefs,
} = storeToRefs(ui);

onMounted(() => {
  void hosts.refresh();
  void ai.refresh();
});

const workspaceStyle = computed(() => {
  const style: Record<string, string> = {};
  if (!sidebarCollapsed.value) {
    style["--sidebar-width"] = `${sidebarWidth.value}px`;
  }
  if (displayPrefs.value.aiPanel && !aiCollapsed.value) {
    style["--ai-panel-width"] = `${aiPanelWidth.value}px`;
  }
  return Object.keys(style).length ? style : undefined;
});
</script>

<template>
  <div class="app-shell">
    <div
      class="workspace"
      :class="{
        'sidebar-collapsed': sidebarCollapsed,
        'ai-collapsed': displayPrefs.aiPanel && aiCollapsed,
        'ai-hidden': !displayPrefs.aiPanel,
      }"
      :style="workspaceStyle"
    >
      <HostSidebar />
      <TerminalPanel />
      <AiPanel v-if="displayPrefs.aiPanel" />
    </div>

    <HostListModal v-if="hostsModalOpen" />
    <ConnectModal v-if="connectModalOpen" />
    <AiSettingsModal v-if="aiSettingsModalOpen" />
    <DisplaySettingsModal v-if="displaySettingsModalOpen" />
    <TerminalSettingsModal v-if="terminalSettingsModalOpen" />
  </div>
</template>
