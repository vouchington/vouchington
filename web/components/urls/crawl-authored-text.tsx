import {
  getContentLanguageDir,
  getEffectiveContentLanguage,
} from '@ts-shared/languages/content-languages'

type CrawlAuthoredElement = 'dd' | 'pre'

interface CrawlAuthoredTextProps {
  as: CrawlAuthoredElement
  className?: string
  /** Declared page language from the crawl HTML `lang`. Null when the crawl has none. */
  lang: string | null
  text: string
}

/** Original crawled page text, kept outside the surrounding translated UI locale. */
export function CrawlAuthoredText({ as: Tag, className, lang, text }: CrawlAuthoredTextProps) {
  const language = getEffectiveContentLanguage({ declaredLanguage: lang })

  return (
    <Tag
      className={className}
      lang={language}
      dir={getContentLanguageDir(language)}
    >
      {text}
    </Tag>
  )
}
