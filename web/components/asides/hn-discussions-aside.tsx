'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import { collectHnDiscussionUrls } from '@/lib/hn-discussions/normalize-url'
import { searchHnDiscussionsForUrls, type HnDiscussionThread } from '@/lib/hn-discussions/search'

export function HnDiscussionsAside({
  enabled,
  urls,
}: {
  enabled: boolean
  urls: Array<string | null | undefined>
}) {
  const pageUrls = collectHnDiscussionUrls(urls)
  const pageUrlKey = pageUrls.join('\n')
  if (!enabled || pageUrlKey.length === 0) return null
  return <HnDiscussionsAsideBody pageUrlKey={pageUrlKey} />
}

export function HnDiscussionsAsideContent({ threads }: { threads: HnDiscussionThread[] }) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  if (threads.length === 0) return null

  return (
    <Card
      className='p-4'
      data-pw='hn-discussions-aside'
    >
      <h3 className='mb-3 text-sm font-semibold'>
        {t('extracted.asides.hnDiscussionsAside.hackerNews_619f304a')}
      </h3>
      <ul className='space-y-3'>
        {threads.map(thread => (
          <li
            key={thread.objectID}
            data-pw='hn-discussions-thread'
          >
            <a
              href={thread.itemUrl}
              rel='nofollow noopener noreferrer'
              target='_blank'
              className='text-sm font-medium hover:underline'
              data-pw='hn-discussions-title'
            >
              {thread.title}
            </a>
            <p className='text-xs text-muted-foreground'>
              <span data-pw='hn-discussions-score'>
                {t('extracted.asides.hnDiscussionsAside.pointsPoints_29c78cd8', {
                  points: formatNumber(thread.score, uiLocale),
                })}
              </span>
              {' · '}
              <span data-pw='hn-discussions-comments'>
                {t('extracted.asides.hnDiscussionsAside.commentsComments_29834540', {
                  comments: formatNumber(thread.commentCount, uiLocale),
                })}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function HnDiscussionsAsideBody({ pageUrlKey }: { pageUrlKey: string }) {
  const [threads, setThreads] = useState<HnDiscussionThread[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void searchHnDiscussionsForUrls(pageUrlKey.split('\n')).then(nextThreads => {
      if (!cancelled) setThreads(nextThreads)
    })
    return () => {
      cancelled = true
    }
  }, [pageUrlKey])

  if (!threads) return null
  return <HnDiscussionsAsideContent threads={threads} />
}
