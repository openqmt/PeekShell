/**
 * WebView / browser host guards installed once after mount:
 * native input hints, Find shortcut, and (production) context menu.
 */

const HINT_ATTRS: ReadonlyArray<[string, string]> = [
  ["autocomplete", "off"],
  ["autocorrect", "off"],
  ["autocapitalize", "off"],
  ["spellcheck", "false"],
];

const SKIP_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "button",
  "submit",
  "reset",
  "hidden",
]);

function disableHintsOn(el: Element) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) return;
  for (const [name, value] of HINT_ATTRS) {
    el.setAttribute(name, value);
  }
}

/** Disable macOS / WebKit autocomplete / autocorrect / spellcheck on text fields. */
function installDisableNativeInputHints() {
  document.documentElement.setAttribute("spellcheck", "false");
  document.body?.setAttribute("spellcheck", "false");

  document.querySelectorAll("input, textarea").forEach((el) => disableHintsOn(el));

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        disableHintsOn(node);
        node.querySelectorAll("input, textarea").forEach(disableHintsOn);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function isBrowserFindKey(ev: KeyboardEvent): boolean {
  if (ev.key === "F3") return true;
  if (ev.key.toLowerCase() !== "f") return false;
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false;
  return true;
}

/** Terminal / CodeMirror must see Ctrl+F before preventDefault. */
function isAppFindTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(".cm-editor, .xterm");
}

/**
 * Prevent the host WebView Find UI (Ctrl/Cmd+F, F3).
 * Skip targets that own app find — CodeMirror ignores keydown once defaultPrevented.
 */
function installDisableBrowserFind() {
  window.addEventListener(
    "keydown",
    (ev) => {
      if (!isBrowserFindKey(ev)) return;
      if (isAppFindTarget(ev.target)) return;
      ev.preventDefault();
    },
    true,
  );
}

/** Production only: hide native right-click menu (dev keeps it for inspect). */
function installDisableDefaultContextMenu() {
  if (import.meta.env.DEV) return;
  window.addEventListener("contextmenu", (ev) => ev.preventDefault(), true);
}

export function installWebViewGuards() {
  installDisableNativeInputHints();
  installDisableBrowserFind();
  installDisableDefaultContextMenu();
}
