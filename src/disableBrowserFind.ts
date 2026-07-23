/**
 * Prevent the host WebView / browser Find UI (Ctrl/Cmd+F, F3) from opening.
 * Skip targets that own app find — CodeMirror ignores keydown once defaultPrevented.
 */
function isBrowserFindKey(ev: KeyboardEvent): boolean {
  if (ev.key === 'F3') return true
  if (ev.key.toLowerCase() !== 'f') return false
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false
  return true
}

/** Terminal / CodeMirror must see Ctrl+F before preventDefault. */
function isAppFindTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest('.cm-editor, .xterm')
}

export function installDisableBrowserFind() {
  window.addEventListener(
    'keydown',
    (ev) => {
      if (!isBrowserFindKey(ev)) return
      if (isAppFindTarget(ev.target)) return
      ev.preventDefault()
    },
    true
  )
}
