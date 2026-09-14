'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { TrendingFeedsViewModel } from '@/lib/view-models/homepage-view-models'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { FollowButton as FollowButtonComponent } from '@/components/shared/follow-button'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowButton = dynamic<Parameters<typeof FollowButtonComponent>[0]>(() =>
  import('@/components/shared/follow-button').then(mod => mod.FollowButton),
)

interface TrendingFeedsProps {
  data: TrendingFeedsViewModel | null
}

export function TrendingFeeds({ data }: TrendingFeedsProps) {
  const t = useTranslations()
  if (!data || data.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('extracted.home.trendingFeeds.noTrendingFeedsRightNow_4c6657bb')}
      </p>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='divide-y rounded-md bg-card shadow-sm'>
        {data.map(feed => {
          return (
            <div
              key={feed.id}
              className='flex items-start justify-between gap-3 p-4'
            >
              <div className='min-w-0 space-y-1'>
                <Link
                  href={feed.href}
                  prefetch={false}
                  className='block truncate font-medium hover:underline'
                >
                  {feed.title}
                </Link>
                <p className='truncate text-xs text-muted-foreground'>{feed.displayName}</p>
              </div>
              <div className='shrink-0'>
                <FollowButton
                  entityType='rss_feed'
                  entityId={feed.id}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className='text-sm'>
        <Link
          href='/sources'
          prefetch={false}
          className='text-primary hover:underline'
        >
          {t('extracted.home.trendingFeeds.viewAllSources_17788d85')}
        </Link>
      </div>
    </div>
  )
}
