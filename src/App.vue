<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted } from "vue";
import AiPanel from "./components/AiPanel.vue";
import ConnectModal from "./components/ConnectModal.vue";
import DisplaySettingsModal from "./components/DisplaySettingsModal.vue";
import HostListModal from "./components/HostListModal.vue";
import HostSidebar from "./components/HostSidebar.vue";
import NoteModal from "./components/NoteModal.vue";
import TerminalPanel from "./components/TerminalPanel.vue";
import TerminalSettingsModal from "./components/TerminalSettingsModal.vue";
import EditorSettingsModal from "./components/EditorSettingsModal.vue";
import ExplorerSettingsModal from "./components/ExplorerSettingsModal.vue";
import { useAiStore } from "./stores/ai";
import { useHostsStore } from "./stores/hosts";
import { useNoteStore } from "./stores/note";
import { useUiStore } from "./stores/ui";

const ai = useAiStore();
const hosts = useHostsStore();
const note = useNoteStore();
const ui = useUiStore();
const {
  sidebarCollapsed,
  aiCollapsed,
  aiPanelWidth,
  sidebarWidth,
  hostsModalOpen,
  connectModalOpen,
  displaySettingsModalOpen,
  terminalSettingsModalOpen,
  editorSettingsModalOpen,
  explorerSettingsModalOpen,
  displayPrefs,
} = storeToRefs(ui);
const { aiChatEnabled } = storeToRefs(note);

/** AI panel only when user pref and remote `aichat` allow it. */
const showAiPanel = computed(() => displayPrefs.value.aiPanel && aiChatEnabled.value);

onMounted(() => {
  void hosts.refresh();
  void ai.refresh();
  void note.refresh();
});

const workspaceStyle = computed(() => {
  const style: Record<string, string> = {};
  if (!sidebarCollapsed.value) {
    style["--sidebar-width"] = `${sidebarWidth.value}px`;
  }
  if (showAiPanel.value && !aiCollapsed.value) {
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
        'ai-collapsed': showAiPanel && aiCollapsed,
        'ai-hidden': !showAiPanel,
      }"
      :style="workspaceStyle"
    >
      <HostSidebar />
      <TerminalPanel />
      <AiPanel v-if="showAiPanel" />
    </div>

    <HostListModal v-if="hostsModalOpen" />
    <ConnectModal v-if="connectModalOpen" />
    <DisplaySettingsModal v-if="displaySettingsModalOpen" />
    <TerminalSettingsModal v-if="terminalSettingsModalOpen" />
    <EditorSettingsModal v-if="editorSettingsModalOpen" />
    <ExplorerSettingsModal v-if="explorerSettingsModalOpen" />
    <NoteModal />
  </div>
</template>
