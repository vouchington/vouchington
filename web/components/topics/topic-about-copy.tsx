import {
  getContentLanguageDir,
  getEffectiveContentLanguage,
} from '@ts-shared/languages/content-languages'

interface TopicAboutCopyProps {
  markdown?: string | null
  detectedLanguage?: string | null
  className?: string
}

const TOPIC_ABOUT_EXCERPT_LENGTH = 200

/** Original topic about text, kept outside the surrounding translated UI locale. */
export function TopicAboutCopy({ markdown, detectedLanguage, className }: TopicAboutCopyProps) {
  if (!markdown?.trim()) return null

  const language = getEffectiveContentLanguage({ detectedLanguage })

  return (
    <p
      className={className}
      lang={language}
      dir={getContentLanguageDir(language)}
    >
      {markdown.slice(0, TOPIC_ABOUT_EXCERPT_LENGTH)}
    </p>
  )
}
