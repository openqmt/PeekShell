/**
 * Prevent the host WebView / browser Find UI (Ctrl/Cmd+F, F3) from opening.
 * App find (terminal / CodeMirror) still receives the same keydown events.
 */
function isBrowserFindKey(ev: KeyboardEvent): boolean {
  if (ev.key === 'F3') return true
  if (ev.key.toLowerCase() !== 'f') return false
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false
  return true
}

export function installDisableBrowserFind() {
  window.addEventListener(
    'keydown',
    (ev) => {
      if (!isBrowserFindKey(ev)) return
      ev.preventDefault()
    },
    true
  )
}
