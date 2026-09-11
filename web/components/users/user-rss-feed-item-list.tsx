import type { ReactNode } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { NewsItemCard } from '@/components/feed/news-item-card'
import { RssItemNavProvider } from '@/lib/rss-item-nav-provider'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from './relation-management-action'

export function UserRssFeedItemList({
  items,
  emptyTitle,
  emptyDescription,
  children,
  relationAction,
  thumbnailUrls,
  embeds,
}: {
  items: RssFeedItem[]
  emptyTitle: string
  emptyDescription: string
  /** Modal rendered inside the nav context so it can access orderedItemIds. */
  children?: ReactNode
  relationAction?: RelationManagementActionConfig
  thumbnailUrls?: Record<string, string>
  embeds?: Record<string, UrlEmbed>
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon='inbox'
      />
    )
  }

  const orderedItemIds = items.map(item => item.id)

  return (
    <RssItemNavProvider orderedItemIds={orderedItemIds}>
      <div className='space-y-4'>
        {items.map(item => (
          <div
            key={item.id}
            className='space-y-2'
          >
            <NewsItemCard
              item={item}
              thumbnailUrl={thumbnailUrls?.[item.id]}
              embed={embeds?.[item.id]}
            />
            {relationAction ? (
              <RelationManagementAction
                entityId={item.id}
                config={relationAction}
              />
            ) : null}
          </div>
        ))}
      </div>
      {children}
    </RssItemNavProvider>
  )
}
