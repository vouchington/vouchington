'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ExternalLinkIcon } from 'lucide-react'
import { CardHeader } from '@/components/ui/card'
import { SharedByline } from '@/components/shared/shared-byline'
import { NewsItemHeader } from '@/components/news/news-item-header'
import { HackerNewsReferenceLabel } from '@/components/hacker-news/hacker-news-reference-label'
import { RssFeedItemTitle } from '@/components/rss-feed-items/rss-feed-item-title'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { PublicUser } from '@/types/user'
import type { ReportMenuItem as ReportMenuItemComponent } from '@/components/shared/report-menu-item'
import { ManageCategoriesMenuItem } from './manage-categories-menu-item'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowerShareActions = dynamic(() =>
  import('@/components/shared/follower-share-actions').then(mod => mod.FollowerShareActions),
)

const ReportMenuItem = dynamic<Parameters<typeof ReportMenuItemComponent>[0]>(
  () => import('@/components/shared/report-menu-item').then(mod => mod.ReportMenuItem),
  { ssr: false },
)

export function NewsItemCardHeader({
  item,
  badge,
  sharedByUser,
  sharedAt,
  isAuthenticated,
  outboundUrl,
  authoredTitle,
}: {
  item: Pick<
    RssFeedItem,
    'id' | 'published_at' | 'rss_feed' | 'categories' | 'lingua_rs_detected_language'
  >
  badge?: ReactNode
  sharedByUser?: Pick<PublicUser, 'id' | 'username' | 'account_type'>
  sharedAt?: string
  isAuthenticated: boolean
  outboundUrl: string
  authoredTitle: string | null
}) {
  return (
    <CardHeader className='gap-2 pb-2'>
      <div className={isAuthenticated ? 'space-y-1 pr-12' : 'space-y-1'}>
        <SharedByline
          sharedByUser={sharedByUser}
          sharedAt={sharedAt}
        />
        {badge}
        <Link
          href={outboundUrl}
          target='_blank'
          rel='nofollow noopener noreferrer'
          prefetch={false}
          className='text-base font-semibold leading-tight hover:underline'
          data-pw='news-item-title-link'
        >
          <RssFeedItemTitle
            title={authoredTitle}
            detectedLanguage={item.lingua_rs_detected_language}
            fallback='Untitled'
          />{' '}
          <ExternalLinkIcon className='inline-block h-3 w-3 shrink-0 align-baseline text-muted-foreground' />
        </Link>
      </div>
      <NewsItemHeader item={item} />
      <HackerNewsReferenceLabel entityId={item.id} />
      <FollowerShareActions
        entityType='rss_feed_item'
        entityId={item.id}
        compact
        className='absolute right-2 top-2'
        menuLeadingItems={
          <>
            {isAuthenticated && <ManageCategoriesMenuItem entityId={item.id} />}
            {isAuthenticated && (
              <ReportMenuItem
                entityType='rss_feed_item'
                entityId={item.id}
              />
            )}
          </>
        }
      />
    </CardHeader>
  )
}
