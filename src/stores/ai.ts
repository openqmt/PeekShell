import { defineStore } from "pinia";
import { computed, ref } from "vue";
import * as api from "../api/tauri";
import type { AiProviderRecord, AiProviderUpsert } from "../types/ai";

export const useAiStore = defineStore("ai", () => {
  const providers = ref<AiProviderRecord[]>([]);
  const activeProviderId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref("");

  const activeProvider = computed(
    () => providers.value.find((provider) => provider.id === activeProviderId.value) ?? null
  );

  async function refresh() {
    loading.value = true;
    error.value = "";
    try {
      const settings = await api.getAiSettings();
      providers.value = settings.providers;
      activeProviderId.value = settings.activeProviderId;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function upsert(payload: AiProviderUpsert) {
    const saved = await api.upsertAiProvider(payload);
    await refresh();
    return saved;
  }

  async function remove(id: string) {
    await api.deleteAiProvider(id);
    await refresh();
  }

  async function activate(id: string) {
    await api.setActiveAiProvider(id);
    activeProviderId.value = id;
  }

  return {
    providers,
    activeProviderId,
    activeProvider,
    loading,
    error,
    refresh,
    upsert,
    remove,
    activate,
  };
});
