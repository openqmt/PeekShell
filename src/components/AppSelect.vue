<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

export type SelectOption = {
  value: string;
  label: string;
};

const model = defineModel<string>({ required: true });

const props = withDefaults(
  defineProps<{
    options: SelectOption[];
    disabled?: boolean;
    placeholder?: string;
  }>(),
  {
    disabled: false,
    placeholder: "",
  }
);

const emit = defineEmits<{
  change: [value: string];
}>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const highlight = ref(-1);
const menuStyle = ref<Record<string, string>>({});

const selectedLabel = computed(() => {
  const hit = props.options.find((o) => o.value === model.value);
  return hit?.label ?? props.placeholder;
});

const hasValue = computed(() => props.options.some((o) => o.value === model.value));

function close() {
  open.value = false;
  highlight.value = -1;
}

function updateMenuPosition() {
  const trigger = rootEl.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const maxHeight = 220;
  const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
  const spaceAbove = rect.top - gap - 8;
  const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
  const height = Math.min(maxHeight, openUp ? spaceAbove : spaceBelow);

  menuStyle.value = {
    position: "fixed",
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    maxHeight: `${Math.max(120, height)}px`,
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + gap}px`, top: "auto" }
      : { top: `${rect.bottom + gap}px`, bottom: "auto" }),
  };
}

async function toggle() {
  if (props.disabled) return;
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  highlight.value = Math.max(
    0,
    props.options.findIndex((o) => o.value === model.value)
  );
  updateMenuPosition();
  await nextTick();
  scrollHighlightIntoView();
}

function pick(value: string) {
  if (model.value !== value) {
    model.value = value;
    emit("change", value);
  }
  close();
}

function scrollHighlightIntoView() {
  const list = menuEl.value;
  if (!list || highlight.value < 0) return;
  const item = list.children[highlight.value] as HTMLElement | undefined;
  item?.scrollIntoView({ block: "nearest" });
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return;

  if (!open.value) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      void toggle();
    }
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    close();
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlight.value = Math.min(props.options.length - 1, highlight.value + 1);
    scrollHighlightIntoView();
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    highlight.value = Math.max(0, highlight.value - 1);
    scrollHighlightIntoView();
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    const opt = props.options[highlight.value];
    if (opt) pick(opt.value);
  }
}

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return;
  const target = e.target as Node;
  if (rootEl.value?.contains(target) || menuEl.value?.contains(target)) return;
  close();
}

function onViewportChange() {
  if (open.value) updateMenuPosition();
}

watch(
  () => props.options,
  () => {
    if (open.value && highlight.value >= props.options.length) {
      highlight.value = Math.max(0, props.options.length - 1);
    }
  }
);

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown);
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("scroll", onViewportChange, true);
});
</script>

<template>
  <div
    ref="rootEl"
    class="app-select"
    :class="{ open, disabled, empty: !hasValue }"
  >
    <button
      type="button"
      class="app-select-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="app-select-value">{{ selectedLabel }}</span>
      <span class="app-select-chevron" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path
            d="M4.2 6.2 8 10l3.8-3.8"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </button>

    <Teleport to="body">
      <Transition name="select-menu">
        <ul
          v-if="open"
          ref="menuEl"
          class="app-select-menu"
          role="listbox"
          :style="menuStyle"
          :aria-activedescendant="highlight >= 0 ? `opt-${highlight}` : undefined"
        >
          <li
            v-for="(opt, i) in options"
            :id="`opt-${i}`"
            :key="opt.value"
            role="option"
            class="app-select-option"
            :class="{
              selected: opt.value === model,
              highlight: i === highlight,
            }"
            :aria-selected="opt.value === model"
            @pointerenter="highlight = i"
            @click="pick(opt.value)"
          >
            <span>{{ opt.label }}</span>
            <span v-if="opt.value === model" class="app-select-check" aria-hidden="true">✓</span>
          </li>
          <li v-if="!options.length" class="app-select-empty">—</li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.app-select {
  position: relative;
  width: 100%;
}

.app-select-trigger {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-root);
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.app-select-trigger:hover:not(:disabled) {
  border-color: var(--text-dim);
  background: var(--bg-elevated);
}

.app-select.open .app-select-trigger,
.app-select-trigger:focus-visible {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.app-select.disabled .app-select-trigger {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-select.empty .app-select-value {
  color: var(--text-dim);
}

.app-select-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select-chevron {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  color: var(--text-dim);
  transition: transform 0.18s ease, color 0.15s ease;
}

.app-select.open .app-select-chevron {
  transform: rotate(180deg);
  color: var(--accent);
}

.app-select-menu {
  z-index: 80;
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.28),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: var(--font-ui);
}

.app-select-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}

.app-select-option span:first-child {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select-option.highlight,
.app-select-option:hover {
  background: var(--bg-hover);
}

.app-select-option.selected {
  color: var(--accent);
  background: var(--accent-dim);
}

.app-select-option.selected.highlight {
  filter: brightness(1.08);
}

.app-select-check {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
}

.app-select-empty {
  padding: 10px;
  text-align: center;
  color: var(--text-dim);
  font-size: 12px;
}

.select-menu-enter-active,
.select-menu-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.select-menu-enter-from,
.select-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
