<script setup lang="ts">
/**
 * CodeMirror 6 text editor for remote file preview.
 * Mod-f uses CM search panel; Mod-s emits save for the parent to persist.
 * Syntax highlighting follows filename via @codemirror/language-data.
 * Appearance (theme / font / size) follows editorPrefs.
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
import { openSearchPanel, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
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
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { languageSupportForFilename } from "../editor/language";
import { useEditorPrefsStore, type EditorColorScheme } from "../stores/editorPrefs";
import { useUiStore, type ThemeMode } from "../stores/ui";

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

const editorPrefs = useEditorPrefsStore();
const ui = useUiStore();
const { prefs } = storeToRefs(editorPrefs);
const { theme: uiTheme } = storeToRefs(ui);

const hostEl = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const editableCompartment = new Compartment();
const languageCompartment = new Compartment();
const appearanceCompartment = new Compartment();
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

type AppearanceColors = {
  background: string;
  foreground: string;
  caret: string;
  selection: string;
  activeLine: string;
  gutterFg: string;
  gutterBorder: string;
  panelBg: string;
  panelBorder: string;
  matchBg: string;
  matchSelectedBg: string;
  matchOutline: string;
  inputBg: string;
  inputBorder: string;
  placeholder: string;
};

function resolveScheme(scheme: EditorColorScheme, appTheme: ThemeMode): "dark" | "light" {
  if (scheme === "theme") return appTheme;
  return scheme;
}

function colorsForScheme(resolved: "dark" | "light", followCss: boolean): AppearanceColors {
  if (followCss) {
    return {
      background: "transparent",
      foreground: "var(--text)",
      caret: "var(--accent)",
      selection: "var(--accent-dim)",
      activeLine: "var(--bg-hover)",
      gutterFg: "var(--text-dim)",
      gutterBorder: "var(--border-soft)",
      panelBg: "var(--bg-elevated)",
      panelBorder: "var(--border)",
      matchBg: "var(--warn-dim)",
      matchSelectedBg: "var(--accent-dim)",
      matchOutline: "var(--accent-border)",
      inputBg: "var(--bg-root)",
      inputBorder: "var(--border-soft)",
      placeholder: "var(--text-dim)",
    };
  }
  if (resolved === "light") {
    return {
      background: "#f6f8fa",
      foreground: "#1f2328",
      caret: "#1a7f37",
      selection: "rgba(26, 127, 55, 0.22)",
      activeLine: "rgba(31, 35, 40, 0.05)",
      gutterFg: "#656d76",
      gutterBorder: "#d0d7de",
      panelBg: "#ffffff",
      panelBorder: "#d0d7de",
      matchBg: "rgba(210, 153, 34, 0.28)",
      matchSelectedBg: "rgba(26, 127, 55, 0.22)",
      matchOutline: "rgba(26, 127, 55, 0.45)",
      inputBg: "#ffffff",
      inputBorder: "#d0d7de",
      placeholder: "#656d76",
    };
  }
  return {
    background: "#0a0d10",
    foreground: "#d6dde6",
    caret: "#3ecf8e",
    selection: "rgba(62, 207, 142, 0.22)",
    activeLine: "rgba(255, 255, 255, 0.04)",
    gutterFg: "#6b7280",
    gutterBorder: "rgba(255, 255, 255, 0.08)",
    panelBg: "#12161c",
    panelBorder: "rgba(255, 255, 255, 0.1)",
    matchBg: "rgba(210, 153, 34, 0.28)",
    matchSelectedBg: "rgba(62, 207, 142, 0.22)",
    matchOutline: "rgba(62, 207, 142, 0.45)",
    inputBg: "#0a0d10",
    inputBorder: "rgba(255, 255, 255, 0.12)",
    placeholder: "#6b7280",
  };
}

function buildAppearance(
  scheme: EditorColorScheme,
  appTheme: ThemeMode,
  fontFamily: string,
  fontSize: number
): Extension {
  const followCss = scheme === "theme";
  const resolved = resolveScheme(scheme, appTheme);
  const c = colorsForScheme(resolved, followCss);
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: `${fontSize}px`,
        backgroundColor: c.background,
        color: c.foreground,
      },
      ".cm-scroller": {
        fontFamily,
        lineHeight: "1.45",
        overflow: "auto",
      },
      ".cm-content": {
        caretColor: c.caret,
        padding: "8px 0",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: c.caret,
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: c.selection,
      },
      ".cm-activeLine": {
        backgroundColor: c.activeLine,
      },
      ".cm-activeLineGutter": {
        backgroundColor: c.activeLine,
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: c.gutterFg,
        border: "none",
        borderRight: `1px solid ${c.gutterBorder}`,
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 8px 0 10px",
        minWidth: "2.2em",
      },
      ".cm-panels": {
        backgroundColor: c.panelBg,
        color: c.foreground,
        borderTop: `1px solid ${c.panelBorder}`,
      },
      ".cm-panels.cm-panels-top": {
        borderBottom: `1px solid ${c.panelBorder}`,
        borderTop: "none",
      },
      ".cm-searchMatch": {
        backgroundColor: c.matchBg,
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: c.matchSelectedBg,
        outline: `1px solid ${c.matchOutline}`,
      },
      ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
        fontSize: "12px",
        color: c.foreground,
      },
      ".cm-panel.cm-search input": {
        background: c.inputBg,
        border: `1px solid ${c.inputBorder}`,
        borderRadius: "6px",
        padding: "2px 6px",
      },
      ".cm-panel.cm-search button": {
        background: c.inputBg,
        border: `1px solid ${c.inputBorder}`,
        borderRadius: "6px",
        cursor: "pointer",
      },
      ".cm-placeholder": {
        color: c.placeholder,
      },
    },
    { dark: resolved === "dark" }
  );
}

function appearanceExt(): Extension {
  return appearanceCompartment.of(
    buildAppearance(
      prefs.value.colorScheme,
      uiTheme.value,
      prefs.value.fontFamily,
      prefs.value.fontSize
    )
  );
}

function reconfigureAppearance() {
  view?.dispatch({
    effects: appearanceCompartment.reconfigure(
      buildAppearance(
        prefs.value.colorScheme,
        uiTheme.value,
        prefs.value.fontFamily,
        prefs.value.fontSize
      )
    ),
  });
}

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
    appearanceExt(),
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

function selectedText(): string {
  if (!view) return "";
  return view.state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => view!.state.sliceDoc(r.from, r.to))
    .join("\n");
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

watch(
  [() => prefs.value.colorScheme, () => prefs.value.fontFamily, () => prefs.value.fontSize, uiTheme],
  () => {
    reconfigureAppearance();
  }
);

defineExpose({
  focus() {
    view?.focus();
  },
  hasSelection() {
    return !!view && view.state.selection.ranges.some((r) => !r.empty);
  },
  async copySelection() {
    const text = selectedText();
    if (!text) return false;
    try {
      await writeText(text);
      return true;
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
  },
  async pasteClipboard() {
    if (!view || props.readonly) return false;
    let text = "";
    try {
      text = await readText();
    } catch {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return false;
      }
    }
    if (!text) return false;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
    return true;
  },
  openFind() {
    if (!view) return;
    openSearchPanel(view);
    view.focus();
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
