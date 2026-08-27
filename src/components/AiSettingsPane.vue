<script setup lang="ts">
/**
 * Model provider settings pane for the app Settings modal.
 * Compact list + form: add/edit providers, models, and API keys.
 */
import { storeToRefs } from "pinia";
import { computed, reactive, ref } from "vue";
import * as api from "../api/tauri";
import { useI18n } from "../i18n";
import { useAiStore } from "../stores/ai";
import type { AiProviderKind, AiProviderRecord, AiProviderUpsert } from "../types/ai";
import AppSelect from "./AppSelect.vue";

const ai = useAiStore();
const { t } = useI18n();
const { providers, activeProviderId } = storeToRefs(ai);
const saving = ref(false);
const error = ref("");
const selectedId = ref<string | null>(null);
const modelDraft = ref("");
const apiKeyVisible = ref(false);
const apiKeyLoading = ref(false);

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

const providerOptions = computed(() =>
  providers.value.map((p) => ({
    value: p.id,
    label: activeProviderId.value === p.id ? `${p.name} · ${t("aiSettings.current")}` : p.name,
  }))
);

const isNew = computed(() => selectedId.value === null);

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
  apiKeyVisible.value = false;
  apiKeyLoading.value = false;
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
  apiKeyVisible.value = false;
  apiKeyLoading.value = false;
  modelDraft.value = "";
  error.value = "";
}

function onProviderPick(id: string) {
  const provider = providers.value.find((p) => p.id === id);
  if (provider) editProvider(provider);
}

function cancelNew() {
  const next = ai.activeProvider ?? providers.value[0];
  if (next) editProvider(next);
}

function onKindChange() {
  const preset = defaults[form.kind];
  form.baseUrl = preset.baseUrl;
  form.models = [...preset.models];
  form.activeModel = preset.models[0] ?? "";
  if (!selectedId.value) form.name = preset.name;
}

/** Reveal stored API key on demand; keys are not kept in the provider list. */
async function toggleApiKeyVisible() {
  if (apiKeyVisible.value) {
    apiKeyVisible.value = false;
    return;
  }
  if (!form.apiKey && selectedId.value && form.hasApiKey) {
    apiKeyLoading.value = true;
    try {
      const key = await api.getAiProviderApiKey(selectedId.value);
      if (key) {
        form.apiKey = key;
      } else {
        error.value = t("aiSettings.noSavedKey");
        return;
      }
    } catch (e) {
      error.value = String(e);
      return;
    } finally {
      apiKeyLoading.value = false;
    }
  }
  apiKeyVisible.value = true;
}

function addModel() {
  const model = modelDraft.value.trim();
  if (!model) return;
  if (!form.models.includes(model)) form.models.push(model);
  if (!form.activeModel) form.activeModel = model;
  modelDraft.value = "";
}

function removeModel(model: string) {
  form.models = form.models.filter((item) => item !== model);
  if (form.activeModel === model) form.activeModel = form.models[0] ?? "";
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

const initial = ai.activeProvider ?? providers.value[0];
if (initial) editProvider(initial);
else newProvider();
</script>

<template>
  <div class="ai-pane">
    <div class="provider-bar">
      <AppSelect
        v-if="providers.length && !isNew"
        class="provider-select"
        :model-value="selectedId ?? ''"
        :options="providerOptions"
        @update:model-value="(v) => onProviderPick(String(v))"
      />
      <div v-else-if="isNew && providers.length" class="new-badge">{{ t("aiSettings.newDraft") }}</div>
      <div v-else class="empty-hint">{{ t("aiSettings.empty") }}</div>
      <button
        v-if="isNew && providers.length"
        type="button"
        class="btn ghost md"
        @click="cancelNew"
      >
        {{ t("common.cancel") }}
      </button>
      <button type="button" class="btn ghost md" @click="newProvider()">{{ t("aiSettings.add") }}</button>
    </div>

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
            <button
              v-for="model in form.models"
              :key="model"
              type="button"
              class="model-chip"
              :class="{ active: form.activeModel === model }"
              :title="t('aiSettings.setDefault')"
              @click="form.activeModel = model"
            >
              <span class="model-id">{{ model }}</span>
              <span v-if="form.activeModel === model" class="default-dot" />
              <span
                class="model-remove"
                role="button"
                :aria-label="t('common.delete')"
                @click.stop="removeModel(model)"
              >×</span>
            </button>
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
        </div>
      </div>
      <div class="field full">
        <label>{{ form.kind === "ollama" ? t("aiSettings.apiKeyOptional") : t("aiSettings.apiKey") }}</label>
        <div class="secret-input">
          <input
            v-model="form.apiKey"
            :type="apiKeyVisible ? 'text' : 'password'"
            autocomplete="off"
            :placeholder="form.hasApiKey ? t('aiSettings.keySaved') : t('aiSettings.keyInput')"
            :disabled="form.clearApiKey"
          />
          <button
            type="button"
            class="secret-toggle"
            :title="apiKeyVisible ? t('connect.hidePassword') : t('connect.showPassword')"
            :aria-label="apiKeyVisible ? t('connect.hidePassword') : t('connect.showPassword')"
            :disabled="form.clearApiKey || apiKeyLoading"
            @click="toggleApiKeyVisible"
          >
            <svg
              v-if="apiKeyVisible"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4-6-4-6-4Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              <circle cx="8" cy="8" r="1.7" stroke="currentColor" stroke-width="1.5" />
              <path
                d="M3 13 13 3"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4-6-4-6-4Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              <circle cx="8" cy="8" r="1.7" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </button>
        </div>
      </div>
      <label v-if="form.hasApiKey" class="clear-key full">
        <input v-model="form.clearApiKey" type="checkbox" />
        {{ t("aiSettings.clearKey") }}
      </label>
    </div>

    <div class="pane-actions">
      <button
        v-if="selectedId"
        type="button"
        class="btn danger md"
        @click="remove"
      >
        {{ t("common.delete") }}
      </button>
      <button
        v-if="selectedId && activeProviderId !== selectedId"
        type="button"
        class="btn ghost md"
        @click="activate"
      >
        {{ t("aiSettings.setActive") }}
      </button>
      <button type="button" class="btn primary md save-btn" :disabled="saving" @click="save">
        {{ saving ? t("common.saving") : t("aiSettings.save") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ai-pane {
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--ui-scale, 1));
  min-height: 100%;
}

.provider-bar {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--ui-scale, 1));
}

.provider-select {
  flex: 1;
  min-width: 0;
}

.empty-hint,
.new-badge {
  flex: 1;
  min-width: 0;
  font-size: calc(12px * var(--ui-scale, 1));
  color: var(--text-dim);
}

.new-badge {
  color: var(--accent);
  font-weight: 600;
}

.form-grid {
  gap: calc(10px * var(--ui-scale, 1));
}

.model-editor {
  display: flex;
  flex-direction: column;
  gap: calc(8px * var(--ui-scale, 1));
}

.model-chips {
  display: flex;
  flex-wrap: wrap;
  gap: calc(6px * var(--ui-scale, 1));
}

.model-chip {
  display: inline-flex;
  align-items: center;
  gap: calc(6px * var(--ui-scale, 1));
  max-width: 100%;
  margin: 0;
  padding: calc(4px * var(--ui-scale, 1)) calc(6px * var(--ui-scale, 1)) calc(4px * var(--ui-scale, 1)) calc(8px * var(--ui-scale, 1));
  border: 1px solid var(--border);
  border-radius: calc(6px * var(--ui-scale, 1));
  background: var(--bg-root);
  color: var(--text);
  font: calc(11px * var(--ui-scale, 1)) var(--font-mono);
  cursor: pointer;
}

.model-chip:hover {
  border-color: var(--accent-border);
  background: var(--bg-hover);
}

.model-chip.active {
  border-color: var(--accent-border);
  background: var(--accent-dim);
}

.model-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.default-dot {
  width: calc(6px * var(--ui-scale, 1));
  height: calc(6px * var(--ui-scale, 1));
  border-radius: calc(999px * var(--ui-scale, 1));
  background: var(--accent);
  flex-shrink: 0;
}

.model-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(16px * var(--ui-scale, 1));
  height: calc(16px * var(--ui-scale, 1));
  border-radius: calc(4px * var(--ui-scale, 1));
  color: var(--text-dim);
  font-size: calc(13px * var(--ui-scale, 1));
  line-height: 1;
  flex-shrink: 0;
}

.model-remove:hover {
  color: var(--danger);
  background: var(--bg-hover);
}

.model-add-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: calc(8px * var(--ui-scale, 1));
}

.clear-key {
  display: flex;
  align-items: center;
  gap: calc(7px * var(--ui-scale, 1));
  color: var(--text-muted);
  font-size: calc(11px * var(--ui-scale, 1));
  cursor: pointer;
}

.clear-key input {
  accent-color: var(--danger);
}

.pane-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(8px * var(--ui-scale, 1));
  margin-top: auto;
  padding-top: calc(12px * var(--ui-scale, 1));
  border-top: 1px solid var(--border-soft);
}

.save-btn {
  margin-left: auto;
}

.secret-input {
  position: relative;
}

.secret-input input {
  width: 100%;
  padding-right: calc(32px * var(--ui-scale, 1)) !important;
}

.secret-toggle {
  position: absolute;
  top: 50%;
  right: calc(2px * var(--ui-scale, 1));
  width: calc(26px * var(--ui-scale, 1));
  height: calc(26px * var(--ui-scale, 1));
  margin: 0;
  padding: 0;
  border: none;
  border-radius: calc(5px * var(--ui-scale, 1));
  background: transparent;
  color: var(--text-muted);
  display: grid;
  place-items: center;
  transform: translateY(-50%);
}

.secret-toggle:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text);
}

.secret-toggle:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
