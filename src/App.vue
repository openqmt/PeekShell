<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import AiPanel from "./components/AiPanel.vue";
import AiSettingsModal from "./components/AiSettingsModal.vue";
import ConnectModal from "./components/ConnectModal.vue";
import HostListModal from "./components/HostListModal.vue";
import HostSidebar from "./components/HostSidebar.vue";
import TerminalPanel from "./components/TerminalPanel.vue";
import { useAiStore } from "./stores/ai";
import { useHostsStore } from "./stores/hosts";
import { useUiStore } from "./stores/ui";

const ai = useAiStore();
const hosts = useHostsStore();
const ui = useUiStore();
const { sidebarCollapsed, aiCollapsed, hostsModalOpen, connectModalOpen, aiSettingsModalOpen } =
  storeToRefs(ui);

onMounted(() => {
  void hosts.refresh();
  void ai.refresh();
});
</script>

<template>
  <div class="app-shell">
    <div
      class="workspace"
      :class="{
        'sidebar-collapsed': sidebarCollapsed,
        'ai-collapsed': aiCollapsed,
      }"
    >
      <HostSidebar />
      <TerminalPanel />
      <AiPanel />
    </div>

    <HostListModal v-if="hostsModalOpen" />
    <ConnectModal v-if="connectModalOpen" />
    <AiSettingsModal v-if="aiSettingsModalOpen" />
  </div>
</template>
