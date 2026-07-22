<script setup lang="ts">
/**
 * CodeMirror 6 text editor for remote file preview.
 * Mod-f uses CM search panel; Mod-s emits save for the parent to persist.
 * Syntax highlighting follows filename via @codemirror/language-data.
 */
import {
  EditorView,
  keymap,
  placeholder,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { languageSupportForFilename } from "../editor/language";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    filename?: string;
    readonly?: boolean;
    placeholderText?: string;
  }>(),
  {
    filename: "",
    readonly: false,
    placeholderText: "",
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
  contextmenu: [event: MouseEvent];
}>();

const hostEl = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const editableCompartment = new Compartment();
const languageCompartment = new Compartment();
/** Bump to ignore stale async language loads. */
let languageLoadId = 0;
/** Suppress emit while applying external doc updates. */
let applyingExternal = false;

/** Highlight colors tuned for both light and dark PeekShell themes. */
const peekHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "#c678dd" },
  { tag: t.operator, color: "#56b6c2" },
  { tag: t.special(t.variableName), color: "#e06c75" },
  { tag: t.typeName, color: "#e5c07b" },
  { tag: t.atom, color: "#d19a66" },
  { tag: t.number, color: "#d19a66" },
  { tag: t.bool, color: "#d19a66" },
  { tag: t.string, color: "#98c379" },
  { tag: t.special(t.string), color: "#98c379" },
  { tag: t.character, color: "#98c379" },
  { tag: t.regexp, color: "#e06c75" },
  { tag: t.definition(t.variableName), color: "#61afef" },
  { tag: t.variableName, color: "var(--text)" },
  { tag: t.propertyName, color: "#e06c75" },
  { tag: t.className, color: "#e5c07b" },
  { tag: t.comment, color: "#7f848e", fontStyle: "italic" },
  { tag: t.meta, color: "#7f848e" },
  { tag: t.heading, color: "#e06c75", fontWeight: "bold" },
  { tag: t.link, color: "#61afef", textDecoration: "underline" },
  { tag: t.url, color: "#56b6c2" },
  { tag: t.tagName, color: "#e06c75" },
  { tag: t.attributeName, color: "#d19a66" },
  { tag: t.attributeValue, color: "#98c379" },
  { tag: t.punctuation, color: "var(--text-muted)" },
  { tag: t.bracket, color: "var(--text-muted)" },
  { tag: t.invalid, color: "var(--danger)" },
]);

const peekTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "11.5px",
    backgroundColor: "transparent",
    color: "var(--text)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.45",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "8px 0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--accent-dim)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--bg-hover)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--bg-hover)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-dim)",
    border: "none",
    borderRight: "1px solid var(--border-soft)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 10px",
    minWidth: "2.2em",
  },
  ".cm-panels": {
    backgroundColor: "var(--bg-elevated)",
    color: "var(--text)",
    borderTop: "1px solid var(--border)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--border)",
    borderTop: "none",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--warn-dim)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--accent-dim)",
    outline: "1px solid var(--accent-border)",
  },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
    fontSize: "12px",
    color: "var(--text)",
  },
  ".cm-panel.cm-search input": {
    background: "var(--bg-root)",
    border: "1px solid var(--border-soft)",
    borderRadius: "6px",
    padding: "2px 6px",
  },
  ".cm-panel.cm-search button": {
    background: "var(--bg-root)",
    border: "1px solid var(--border-soft)",
    borderRadius: "6px",
    cursor: "pointer",
  },
  ".cm-placeholder": {
    color: "var(--text-dim)",
  },
});

function editableExt(readonly: boolean): Extension {
  return editableCompartment.of([
    EditorState.readOnly.of(readonly),
    EditorView.editable.of(!readonly),
  ]);
}

function buildExtensions(readonly: boolean): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    syntaxHighlighting(peekHighlight, { fallback: true }),
    languageCompartment.of([]),
    keymap.of([
      {
        key: "Mod-s",
        run: () => {
          emit("save");
          return true;
        },
      },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
    ]),
    peekTheme,
    editableExt(readonly),
    EditorView.updateListener.of((update) => {
      if (applyingExternal || !update.docChanged) return;
      emit("update:modelValue", update.state.doc.toString());
    }),
    ...(props.placeholderText ? [placeholder(props.placeholderText)] : []),
    EditorView.domEventHandlers({
      contextmenu: (event) => {
        event.preventDefault();
        emit("contextmenu", event);
        return true;
      },
    }),
  ];
}

async function applyLanguage(filename: string) {
  const id = ++languageLoadId;
  const support = await languageSupportForFilename(filename);
  if (id !== languageLoadId || !view) return;
  view.dispatch({
    effects: languageCompartment.reconfigure(support),
  });
}

function createEditor() {
  if (!hostEl.value) return;
  view?.destroy();
  view = new EditorView({
    parent: hostEl.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: buildExtensions(props.readonly),
    }),
  });
  void applyLanguage(props.filename);
}

onMounted(() => {
  createEditor();
});

onBeforeUnmount(() => {
  languageLoadId += 1;
  view?.destroy();
  view = null;
});

watch(
  () => props.modelValue,
  (next) => {
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === next) return;
    applyingExternal = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
    });
    applyingExternal = false;
  }
);

watch(
  () => props.readonly,
  (readonly) => {
    view?.dispatch({
      effects: editableCompartment.reconfigure([
        EditorState.readOnly.of(readonly),
        EditorView.editable.of(!readonly),
      ]),
    });
  }
);

watch(
  () => props.filename,
  (filename) => {
    void applyLanguage(filename);
  }
);

defineExpose({
  focus() {
    view?.focus();
  },
});
</script>

<template>
  <div ref="hostEl" class="preview-cm" />
</template>

<style scoped>
.preview-cm {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.preview-cm :deep(.cm-editor) {
  height: 100%;
}

.preview-cm :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
