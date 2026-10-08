import { MarkdownContent } from '@/components/shared/markdown-content'
import type { MarkdownContentFeatures } from '@/components/shared/markdown-content-features'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'

interface UserBioCopyProps {
  html?: string | null
  markdown?: string | null
  detectedLanguage?: string | null
  className?: string
  features?: MarkdownContentFeatures
}

/** Original user bio, kept outside the surrounding translated UI locale. */
export function UserBioCopy({
  html,
  markdown,
  detectedLanguage,
  className,
  features,
}: UserBioCopyProps) {
  if (!html?.trim() && !markdown?.trim()) return null

  return (
    <MarkdownContent
      html={html}
      markdown={markdown}
      className={className}
      features={features}
      lang={getEffectiveContentLanguage({ detectedLanguage })}
    />
  )
}
