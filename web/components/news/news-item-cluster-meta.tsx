'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatUtcDate } from '@ts-shared/utils/format'
import type { Story } from '@/types/rss-feed-items'
import { useTranslations } from '@/lib/i18n/use-translations'

export function StoryMeta({ story }: { story?: Story }) {
  const t = useTranslations()
  if (!story) return null
  const hasContent = story.published_at != null || story.cluster_reason != null
  if (!hasContent) return null

  return (
    <div className='space-y-1 text-xs text-muted-foreground'>
      {story.cluster_reason && <span>{story.cluster_reason}</span>}
      {story.published_at && (
        <span className='block'>
          {t('extracted.news.newsItemClusterMeta.eventDate_edd33a99', {
            date: formatUtcDate(story.published_at),
          })}
        </span>
      )}
    </div>
  )
}

export function ShowMoreLink({ href }: { href: string }) {
  const t = useTranslations()
  return (
    <Button
      variant='ghost'
      size='sm'
      className='h-auto min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground'
      asChild
    >
      <Link
        href={href}
        scroll={false}
        prefetch={false}
        onClick={preserveCurrentScrollPosition}
        data-pw='news-item-show-more-link'
      >
        {t('extracted.news.newsItemClusterMeta.showMore_f5c9bd13')}
      </Link>
    </Button>
  )
}

function preserveCurrentScrollPosition() {
  const scrollY = window.scrollY
  const restore = () => window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' })
  queueMicrotask(restore)
  requestAnimationFrame(restore)
  window.setTimeout(restore, 0)
}
