/**
 * Docs locale preference: browser language with English fallback.
 * Storage is written only when the user picks a language in the UI.
 */

export const LOCALE_STORAGE_KEY = 'peekshell-docs-locale'

export type DocsLocale = 'zh' | 'en'

/** Inline head script: redirect before first paint when locale mismatches preference. */
export const LOCALE_REDIRECT_SCRIPT = `(function(){
  try {
    var KEY = ${JSON.stringify(LOCALE_STORAGE_KEY)};
    var path = location.pathname;
    var isEn = path === '/en' || path === '/en/' || path.indexOf('/en/') === 0;
    var current = isEn ? 'en' : 'zh';
    var preferred = localStorage.getItem(KEY);
    if (preferred !== 'zh' && preferred !== 'en') {
      var list = (navigator.languages && navigator.languages.length)
        ? navigator.languages
        : [navigator.language || 'en'];
      preferred = 'en';
      for (var i = 0; i < list.length; i++) {
        var l = String(list[i] || '').toLowerCase();
        if (l.indexOf('zh') === 0) { preferred = 'zh'; break; }
        if (l.indexOf('en') === 0) { preferred = 'en'; break; }
      }
    }
    if (preferred === current) return;
    var target;
    if (preferred === 'en') {
      target = (path === '/' || path === '') ? '/en/' : '/en' + path;
    } else {
      target = (path === '/en' || path === '/en/') ? '/' : (path.replace(/^\\/en/, '') || '/');
    }
    location.replace(target + location.search + location.hash);
  } catch (e) {}
})();`

export function localeFromLang(lang: string | undefined): DocsLocale {
  return (lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function persistLocalePreference(locale: DocsLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // private mode / blocked storage
  }
}
