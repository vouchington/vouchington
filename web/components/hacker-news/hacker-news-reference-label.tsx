'use client'

import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import { useHackerNewsReferenceCounts } from './use-hacker-news-reference-counts'

/**
 * Compact card fact, e.g. "Seen on Hacker News · 3 | Mentioned · 12". Shown to everyone, never
 * ranked or weighted; renders nothing when the item has no references.
 */
export function HackerNewsReferenceLabel({ entityId }: { entityId: string }) {
  const counts = useHackerNewsReferenceCounts(entityId)
  const t = useTranslations()
  const uiLocale = useUiLocale()
  if (!counts || (counts.story_count === 0 && counts.comment_count === 0)) return null
  const stories = counts.story_count > 0
  const comments = counts.comment_count > 0
  return (
    <p
      className='text-xs text-muted-foreground'
      data-pw='hacker-news-reference-label'
    >
      {stories && (
        <span data-pw='hacker-news-story-count'>
          {t('shared.hackerNews.seenOnCount', {
            count: formatNumber(counts.story_count, uiLocale),
          })}
        </span>
      )}
      {stories && comments && ' | '}
      {comments && (
        <span data-pw='hacker-news-comment-count'>
          {t(stories ? 'shared.hackerNews.mentionedCount' : 'shared.hackerNews.mentionedOnCount', {
            count: formatNumber(counts.comment_count, uiLocale),
          })}
        </span>
      )}
    </p>
  )
}
