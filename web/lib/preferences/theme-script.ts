// Blocking inline script to apply theme class before first paint.
// Exported as a raw HTML string so the root layout can inject it before
// hydration without importing browser-only theme state.
//
// The content is a static string literal — no user input — so
// dangerouslySetInnerHTML is safe here (no XSS risk).
export const THEME_INIT_SCRIPT = `(function () {
  try {
    const raw = localStorage.getItem('theme')
    const theme = raw === 'dark' || raw === 'light' || raw === 'system' ? raw : 'dark'
    const isDark =
      theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (isDark) document.documentElement.classList.add('dark')
  } catch {}
})()`
