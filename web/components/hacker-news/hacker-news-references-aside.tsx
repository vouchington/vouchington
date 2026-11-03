'use client'

import { Card } from '@/components/ui/card'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber, formatUtcDate } from '@ts-shared/utils/format'
import type { HackerNewsReferenceDetail } from '@/types/hacker-news'

const itemHref = (id: number) => `https://news.ycombinator.com/item?id=${id}`

function ItemLink({ id, children }: { id: number; children: string }) {
  return (
    <a
      href={itemHref(id)}
      rel='nofollow noopener noreferrer'
      target='_blank'
      className='text-sm font-medium hover:underline'
      data-pw='hacker-news-item-link'
    >
      {children}
    </a>
  )
}

/**
 * Detail-page list of the stored Hacker News stories and comments for a post or RSS item.
 * The API orders stories by points and comments by date; text is built from ids and counts.
 */
export function HackerNewsReferencesAside({
  references,
}: {
  references: HackerNewsReferenceDetail | undefined
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  if (!references || (references.stories.length === 0 && references.comments.length === 0)) {
    return null
  }
  return (
    <Card
      className='space-y-4 p-4'
      data-pw='hacker-news-references-aside'
    >
      {references.stories.length > 0 && (
        <section>
          <h3 className='mb-2 text-sm font-semibold'>{t('shared.hackerNews.seenOnHeading')}</h3>
          <ul className='space-y-2'>
            {references.stories.map(story => (
              <li key={story.hacker_news_item_id}>
                <ItemLink id={story.hacker_news_item_id}>
                  {t('shared.hackerNews.storySummary', {
                    points: formatNumber(story.points, uiLocale),
                    comments: formatNumber(story.reply_count, uiLocale),
                  })}
                </ItemLink>
                <p className='text-xs text-muted-foreground'>
                  <time dateTime={story.posted_at}>{formatUtcDate(story.posted_at, uiLocale)}</time>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {references.comments.length > 0 && (
        <section>
          <h3 className='mb-2 text-sm font-semibold'>
            {t('shared.hackerNews.mentionedOnHeading')}
          </h3>
          <ul className='space-y-2'>
            {references.comments.map(comment => (
              <li key={comment.hacker_news_item_id}>
                <ItemLink id={comment.hacker_news_item_id}>
                  {t('shared.hackerNews.commentOn', {
                    date: formatUtcDate(comment.posted_at, uiLocale),
                  })}
                </ItemLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  )
}
