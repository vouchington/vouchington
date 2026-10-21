import type { ReactNode } from 'react'
import {
  getContentLanguageDir,
  getEffectiveContentLanguage,
} from '@ts-shared/languages/content-languages'

interface RssFeedItemTitleProps {
  title?: string | null
  detectedLanguage: string | null | undefined
  fallback?: ReactNode
  className?: string
}

/** Original RSS item title, kept outside the surrounding translated UI locale. */
export function RssFeedItemTitle({
  title,
  detectedLanguage,
  fallback,
  className,
}: RssFeedItemTitleProps) {
  const authoredTitle = title?.trim() ? title : null
  if (!authoredTitle) {
    if (fallback == null || fallback === '') return null
    return <span className={className}>{fallback}</span>
  }

  const language = getEffectiveContentLanguage({ detectedLanguage })
  return (
    <span
      className={className}
      lang={language}
      dir={getContentLanguageDir(language)}
    >
      {authoredTitle}
    </span>
  )
}
