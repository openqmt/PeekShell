<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, reactive, ref } from "vue";
import { useI18n } from "../i18n";
import { useAiStore } from "../stores/ai";
import { useUiStore } from "../stores/ui";
import type { AiProviderKind, AiProviderRecord, AiProviderUpsert } from "../types/ai";
import AppSelect from "./AppSelect.vue";

const ai = useAiStore();
const ui = useUiStore();
const { t } = useI18n();
const { providers, activeProviderId } = storeToRefs(ai);
const saving = ref(false);
const error = ref("");
const selectedId = ref<string | null>(null);
const modelDraft = ref("");

const defaults: Record<AiProviderKind, { name: string; baseUrl: string; models: string[] }> = {
  openAiCompatible: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini", "gpt-4.1"],
  },
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    models: ["claude-sonnet-4-20250514"],
  },
  ollama: {
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    models: ["qwen3"],
  },
};

const form = reactive({
  name: "",
  kind: "openAiCompatible" as AiProviderKind,
  baseUrl: "",
  models: [] as string[],
  activeModel: "",
  apiKey: "",
  clearApiKey: false,
  hasApiKey: false,
});

const kindOptions = computed(() => [
  { value: "openAiCompatible", label: t("aiSettings.kindOpenAi") },
  { value: "anthropic", label: t("aiSettings.kindAnthropic") },
  { value: "ollama", label: t("aiSettings.kindOllama") },
]);

function modelsSummary(provider: AiProviderRecord) {
  if (!provider.models.length) return provider.activeModel;
  if (provider.models.length === 1) return provider.models[0];
  return `${provider.activeModel} · +${provider.models.length - 1}`;
}

function newProvider(kind: AiProviderKind = "openAiCompatible") {
  selectedId.value = null;
  const preset = defaults[kind];
  form.name = preset.name;
  form.kind = kind;
  form.baseUrl = preset.baseUrl;
  form.models = [...preset.models];
  form.activeModel = preset.models[0] ?? "";
  form.apiKey = "";
  form.clearApiKey = false;
  form.hasApiKey = false;
  modelDraft.value = "";
  error.value = "";
}

function editProvider(provider: AiProviderRecord) {
  selectedId.value = provider.id;
  form.name = provider.name;
  form.kind = provider.kind;
  form.baseUrl = provider.baseUrl;
  form.models = [...provider.models];
  form.activeModel = provider.activeModel;
  form.apiKey = "";
  form.clearApiKey = false;
  form.hasApiKey = provider.hasApiKey;
  modelDraft.value = "";
  error.value = "";
}

function onKindChange() {
  const preset = defaults[form.kind];
  form.baseUrl = preset.baseUrl;
  form.models = [...preset.models];
  form.activeModel = preset.models[0] ?? "";
  if (!selectedId.value) form.name = preset.name;
}

function addModel() {
  const model = modelDraft.value.trim();
  if (!model) return;
  if (!form.models.includes(model)) {
    form.models.push(model);
  }
  if (!form.activeModel) form.activeModel = model;
  modelDraft.value = "";
}

function removeModel(model: string) {
  form.models = form.models.filter((item) => item !== model);
  if (form.activeModel === model) {
    form.activeModel = form.models[0] ?? "";
  }
}

function onModelDraftKey(ev: KeyboardEvent) {
  if (ev.key === "Enter") {
    ev.preventDefault();
    addModel();
  }
}

async function save() {
  error.value = "";
  if (!form.models.length) {
    error.value = t("aiSettings.modelsRequired");
    return;
  }
  saving.value = true;
  try {
    const payload: AiProviderUpsert = {
      id: selectedId.value ?? undefined,
      name: form.name,
      kind: form.kind,
      baseUrl: form.baseUrl,
      models: [...form.models],
      activeModel: form.activeModel || form.models[0],
      clearApiKey: form.clearApiKey,
    };
    if (form.apiKey) payload.apiKey = form.apiKey;
    const saved = await ai.upsert(payload);
    editProvider(saved);
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
}

async function activate() {
  if (!selectedId.value) return;
  error.value = "";
  try {
    await ai.activate(selectedId.value);
  } catch (e) {
    error.value = String(e);
  }
}

async function remove() {
  if (!selectedId.value || !window.confirm(t("aiSettings.deleteConfirm", { name: form.name }))) return;
  error.value = "";
  try {
    await ai.remove(selectedId.value);
    const next = ai.activeProvider ?? providers.value[0];
    if (next) editProvider(next);
    else newProvider();
  } catch (e) {
    error.value = String(e);
  }
}

function onBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget) ui.closeAiSettingsModal();
}

const initial = ai.activeProvider ?? providers.value[0];
if (initial) editProvider(initial);
else newProvider();
</script>

<template>
  <div class="overlay" @click="onBackdrop">
    <div class="modal ai-settings" role="dialog" :aria-label="t('aiSettings.aria')">
      <div class="modal-head">
        <div>
          <h2>{{ t("aiSettings.title") }}</h2>
          <div class="sub">{{ t("aiSettings.sub") }}</div>
        </div>
        <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="ui.closeAiSettingsModal()">✕</button>
      </div>

      <div class="settings-body">
        <aside class="provider-list">
          <button type="button" class="btn primary md add-provider" @click="newProvider()">{{ t("aiSettings.add") }}</button>
          <button
            v-for="provider in providers"
            :key="provider.id"
            type="button"
            class="provider-item"
            :class="{ selected: selectedId === provider.id }"
            @click="editProvider(provider)"
          >
            <span class="provider-name">{{ provider.name }}</span>
            <span class="provider-model">{{ modelsSummary(provider) }}</span>
            <span v-if="activeProviderId === provider.id" class="active-mark">{{ t("aiSettings.current") }}</span>
          </button>
          <div v-if="!providers.length" class="empty">{{ t("aiSettings.empty") }}</div>
        </aside>

        <div class="provider-form">
          <div v-if="error" class="error-banner">{{ error }}</div>
          <div class="form-grid">
            <div class="field">
              <label>{{ t("aiSettings.displayName") }}<span class="req">*</span></label>
              <input v-model="form.name" type="text" :placeholder="t('aiSettings.namePlaceholder')" />
            </div>
            <div class="field">
              <label>{{ t("aiSettings.kind") }}<span class="req">*</span></label>
              <AppSelect
                :model-value="form.kind"
                :options="kindOptions"
                @update:model-value="(v) => (form.kind = v as AiProviderKind)"
                @change="onKindChange"
              />
            </div>
            <div class="field full">
              <label>{{ t("aiSettings.baseUrl") }}<span class="req">*</span></label>
              <input v-model="form.baseUrl" type="url" placeholder="https://api.example.com/v1" />
            </div>
            <div class="field full">
              <label>{{ t("aiSettings.models") }}<span class="req">*</span></label>
              <div class="model-editor">
                <div v-if="form.models.length" class="model-chips">
                  <div v-for="model in form.models" :key="model" class="model-chip" :class="{ active: form.activeModel === model }">
                    <button type="button" class="model-pick" @click="form.activeModel = model">
                      {{ model }}
                      <span v-if="form.activeModel === model" class="default-mark">{{ t("aiSettings.defaultModel") }}</span>
                    </button>
                    <button
                      type="button"
                      class="model-remove"
                      :title="t('common.delete')"
                      :aria-label="t('common.delete')"
                      @click="removeModel(model)"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div class="model-add-row">
                  <input
                    v-model="modelDraft"
                    type="text"
                    :placeholder="t('aiSettings.modelPlaceholder')"
                    @keydown="onModelDraftKey"
                  />
                  <button type="button" class="btn ghost md" @click="addModel">{{ t("aiSettings.addModel") }}</button>
                </div>
                <div class="model-hint">{{ t("aiSettings.modelsHint") }}</div>
              </div>
            </div>
            <div class="field full">
              <label>{{ form.kind === "ollama" ? t("aiSettings.apiKeyOptional") : t("aiSettings.apiKey") }}</label>
              <input
                v-model="form.apiKey"
                type="password"
                autocomplete="off"
                :placeholder="form.hasApiKey ? t('aiSettings.keySaved') : t('aiSettings.keyInput')"
                :disabled="form.clearApiKey"
              />
            </div>
            <label v-if="form.hasApiKey" class="clear-key full">
              <input v-model="form.clearApiKey" type="checkbox" />
              {{ t("aiSettings.clearKey") }}
            </label>
          </div>
        </div>
      </div>

      <div class="modal-foot">
        <button v-if="selectedId" type="button" class="btn danger md delete-btn" @click="remove">{{ t("common.delete") }}</button>
        <button
          v-if="selectedId && activeProviderId !== selectedId"
          type="button"
          class="btn ghost md"
          @click="activate"
        >
          {{ t("aiSettings.setActive") }}
        </button>
        <button type="button" class="btn ghost md" @click="ui.closeAiSettingsModal()">{{ t("common.close") }}</button>
        <button type="button" class="btn primary md" :disabled="saving" @click="save">
          {{ saving ? t("common.saving") : t("aiSettings.save") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-settings { width: min(760px, 100%); }
.settings-body {
  flex: 1;
  min-height: 390px;
  display: grid;
  grid-template-columns: 220px 1fr;
  overflow: hidden;
}
.provider-list {
  padding: 12px;
  border-right: 1px solid var(--border-soft);
  background: var(--bg-root);
  overflow: auto;
}
.add-provider { width: 100%; margin-bottom: 10px; }
.provider-item {
  position: relative;
  width: 100%;
  padding: 10px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  text-align: left;
}
.provider-item:hover { background: var(--bg-hover); }
.provider-item.selected {
  border-color: var(--accent-border);
  background: var(--accent-dim);
}
.provider-name, .provider-model { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-name { padding-right: 34px; font-size: 12px; font-weight: 600; }
.provider-model { margin-top: 4px; color: var(--text-dim); font: 10px var(--font-mono); }
.active-mark {
  position: absolute;
  top: 9px;
  right: 8px;
  color: var(--accent);
  font-size: 10px;
}
.empty { padding: 18px 4px; color: var(--text-dim); font-size: 11px; text-align: center; }
.provider-form { padding: 18px; overflow: auto; }
.model-editor { display: flex; flex-direction: column; gap: 8px; }
.model-chips { display: flex; flex-direction: column; gap: 6px; }
.model-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-root);
  overflow: hidden;
}
.model-chip.active {
  border-color: var(--accent-border);
  background: var(--accent-dim);
}
.model-pick {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 7px 10px;
  font: 12px var(--font-mono);
  display: flex;
  align-items: center;
  gap: 8px;
}
.default-mark {
  font: 10px/1 var(--font-sans, inherit);
  color: var(--accent);
  font-family: inherit;
}
.model-remove {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 14px;
}
.model-remove:hover { color: var(--danger); background: var(--bg-hover); }
.model-add-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.model-hint { font-size: 11px; color: var(--text-dim); line-height: 1.4; }
.clear-key {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
  font-size: 11px;
}
.clear-key input { accent-color: var(--danger); }
.delete-btn { margin-right: auto; }
@media (max-width: 640px) {
  .settings-body { grid-template-columns: 150px 1fr; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
