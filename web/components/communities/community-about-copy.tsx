import type { ReactNode } from 'react'
import {
  getContentLanguageDir,
  getEffectiveContentLanguage,
} from '@ts-shared/languages/content-languages'

interface CommunityAboutCopyProps {
  markdown?: string | null
  defaultLanguage?: string | null
  detectedLanguage?: string | null
  className?: string
  emptyClassName?: string
  emptyLabel?: ReactNode
}

/** Original community about text, kept outside the surrounding translated UI locale. */
export function CommunityAboutCopy({
  markdown,
  defaultLanguage,
  detectedLanguage,
  className,
  emptyClassName,
  emptyLabel,
}: CommunityAboutCopyProps) {
  if (!markdown?.trim()) {
    if (emptyLabel == null) return null
    return <p className={emptyClassName ?? className}>{emptyLabel}</p>
  }

  const language = getEffectiveContentLanguage({
    declaredLanguage: defaultLanguage,
    detectedLanguage,
  })

  return (
    <p
      className={className}
      lang={language}
      dir={getContentLanguageDir(language)}
    >
      {markdown}
    </p>
  )
}
