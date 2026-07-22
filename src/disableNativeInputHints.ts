/**
 * Disable macOS / WebKit native input hints (autocomplete, autocorrect, spellcheck)
 * on text fields, including dynamically created ones such as xterm's textarea.
 */
const HINT_ATTRS: ReadonlyArray<[string, string]> = [
  ['autocomplete', 'off'],
  ['autocorrect', 'off'],
  ['autocapitalize', 'off'],
  ['spellcheck', 'false'],
]

const SKIP_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'button',
  'submit',
  'reset',
  'hidden',
])

function disableHintsOn(el: Element) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
  if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) return
  for (const [name, value] of HINT_ATTRS) {
    el.setAttribute(name, value)
  }
}

export function installDisableNativeInputHints() {
  document.documentElement.setAttribute('spellcheck', 'false')
  document.body?.setAttribute('spellcheck', 'false')

  document
    .querySelectorAll('input, textarea')
    .forEach((el) => disableHintsOn(el))

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue
        disableHintsOn(node)
        node.querySelectorAll('input, textarea').forEach(disableHintsOn)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}
