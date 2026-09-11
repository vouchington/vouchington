'use client'

import type { ReactNode } from 'react'
import type { WebSearchResultItem as WebSearchResult } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

const MARK_OPEN = '⟦MARK⟧'
const MARK_CLOSE = '⟦/MARK⟧'

function SnippetText({ snippet }: { snippet: string }): ReactNode {
  const parts: ReactNode[] = []
  let rest = snippet
  let key = 0

  while (rest.length > 0) {
    const openIdx = rest.indexOf(MARK_OPEN)
    if (openIdx === -1) {
      parts.push(rest)
      break
    }
    if (openIdx > 0) parts.push(rest.slice(0, openIdx))
    const afterOpen = rest.slice(openIdx + MARK_OPEN.length)
    const closeIdx = afterOpen.indexOf(MARK_CLOSE)
    if (closeIdx === -1) {
      parts.push(afterOpen)
      break
    }
    parts.push(<mark key={key++}>{afterOpen.slice(0, closeIdx)}</mark>)
    rest = afterOpen.slice(closeIdx + MARK_CLOSE.length)
  }

  return parts
}

interface Props {
  result: WebSearchResult
}

export function WebSearchResultItem({ result }: Props) {
  const t = useTranslations()
  const { url, snippet, match_type } = result

  return (
    <div
      data-pw='web-search-result-item'
      className='space-y-1 py-3'
    >
      {url.hostname && <p className='text-xs text-muted-foreground'>{url.hostname.hostname}</p>}
      <a
        data-pw='web-search-result-link'
        href={url.url}
        target='_blank'
        rel='nofollow noopener noreferrer'
        className='line-clamp-1 text-sm font-medium text-primary hover:text-primary/80'
      >
        {url.url}
      </a>
      {snippet && (
        <p
          data-pw='web-search-result-snippet'
          className='text-sm text-muted-foreground'
        >
          <SnippetText snippet={snippet} />
        </p>
      )}
      {!snippet && match_type === 'url' && (
        <p className='text-xs text-muted-foreground'>
          {t('extracted.webSearch.webSearchResultItem.urlMatch_2447c943')}
        </p>
      )}
    </div>
  )
}
