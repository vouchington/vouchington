import { sanitizeHtmlFragment } from '@/lib/html/safe-html-fragment'
import { getContentLanguageDir } from '@ts-shared/languages/content-languages'
import { demotePreviewHeadings, renderHtmlFragment } from './html-fragment'
import { MarkdownContentEnhancer } from './markdown-content-enhancer'
import type { MarkdownContentFeatures } from './markdown-content-features'

interface MarkdownContentProps {
  html?: string | null
  markdown?: string | null
  className?: string
  preview?: boolean
  /** ISO 639-1 language code for the content (e.g. 'en', 'fr'). Sets the HTML lang attribute. */
  lang?: string
  /**
   * Post-hydration client-side enhancements. Only rendered when at least one
   * feature is explicitly enabled. HTML surfaces with links should opt into
   * UTM rewriting so outbound markdown anchors are consistently attributed.
   */
  features?: MarkdownContentFeatures
}

export function MarkdownContent({
  html,
  markdown,
  className,
  features,
  lang,
  preview = false,
}: MarkdownContentProps) {
  const contentHtml = preview
    ? demotePreviewHeadings(html)
    : html
      ? sanitizeHtmlFragment(html)
      : undefined

  if (contentHtml) {
    if (features?.code || features?.images || features?.eagerFirstImage || features?.utm) {
      return (
        <MarkdownContentEnhancer
          html={contentHtml}
          className={className}
          features={features}
          lang={lang}
        />
      )
    }

    const htmlContent = renderHtmlFragment(contentHtml)
    return (
      <div
        className={className}
        lang={lang}
        dir={getContentLanguageDir(lang)}
      >
        {htmlContent}
      </div>
    )
  }

  if (markdown) {
    return (
      <pre
        className={`whitespace-pre-wrap${className ? ` ${className}` : ''}`}
        lang={lang}
        dir={getContentLanguageDir(lang)}
      >
        {markdown}
      </pre>
    )
  }

  return null
}
