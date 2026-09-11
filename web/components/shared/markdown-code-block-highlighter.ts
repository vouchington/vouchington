import type { BundledLanguage, BundledTheme, HighlighterGeneric } from 'shiki'

// Module-level singleton to avoid re-initializing the Shiki highlighter on every render.
let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null

function getHighlighter(): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ getSingletonHighlighter }) =>
      getSingletonHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: [],
      }),
    )
    // Reset on failure so the next call retries rather than permanently returning a rejected promise.
    highlighterPromise.catch(() => {
      highlighterPromise = null
    })
  }
  return highlighterPromise
}

interface BlockEntry {
  code: HTMLElement
  pre: HTMLElement
  lang: BundledLanguage | 'text'
}

/**
 * Walk all `pre > code[class*="language-"]` blocks inside `container` and
 * replace them with Shiki-highlighted HTML.
 *
 * Runs post-hydration (inside a useEffect), so the initial SSR output is
 * left untouched. Unknown languages are silently left as-is.
 */
export async function highlightCodeBlocks(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre > code[class*="language-"]')
  if (blocks.length === 0) return

  const [highlighter, { bundledLanguages }] = await Promise.all([getHighlighter(), import('shiki')])

  // Collect entries and resolve language names before touching the DOM.
  const entries: BlockEntry[] = []
  for (const code of blocks) {
    const match = /\blanguage-(\S+)/.exec(code.className)
    const raw = match?.[1]
    const pre = code.parentElement
    if (!pre) continue
    const lang: BundledLanguage | 'text' =
      raw && raw in bundledLanguages ? (raw as BundledLanguage) : 'text'
    entries.push({ code, pre, lang })
  }

  // Load all unique non-text languages in parallel before rendering.
  /* c8 ignore next -- reformatted by oxfmt; DOM-level coverage not tracked in unit tests */
  const uniqueLangs = [...new Set(entries.flatMap(e => (e.lang !== 'text' ? [e.lang] : [])))]
  await Promise.all(uniqueLangs.map(lang => highlighter.loadLanguage(lang)))

  // Apply highlighting (sequential DOM mutations are fine here).
  for (const { code, pre, lang } of entries) {
    try {
      const highlighted = highlighter.codeToHtml(code.textContent ?? '', {
        lang,
        themes: { light: 'github-light', dark: 'github-dark' },
      })
      pre.outerHTML = highlighted
    } catch {
      // Unknown language or Shiki error — leave block untouched.
    }
  }
}
