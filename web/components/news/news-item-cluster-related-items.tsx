'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewsItemCard } from '@/components/feed/news-item-card'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import type { FeedStyle } from '@/lib/preferences/shared'
import type { ElectionVote, Post } from '@/types/posts'
import type { RssFeedItem, RssFeedItemElection } from '@/types/rss-feed-items'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'

export interface NewsItemActionContext {
  election?: RssFeedItemElection | null
  electionVote?: ElectionVote | null
  relatedPosts: Post[]
  viewerBookmarks?: Record<string, boolean>
}

export interface RenderActionsParams {
  election?: RssFeedItemElection | null
  electionVote?: ElectionVote | null
  item: RssFeedItem
  itemRelatedPosts: Post[]
  itemViewerBookmarks?: Record<string, boolean>
  modalHref: string
}

interface NewsItemClusterRelatedItemsProps {
  isExpanded: boolean
  renderActions: (params: RenderActionsParams) => React.ReactNode
  renderOfficialBadge: (item: RssFeedItem) => React.ReactNode
  setExpanded: (expanded: boolean) => void
  storyItemActionContexts: Record<string, NewsItemActionContext>
  storyItems: RssFeedItem[]
  storyItemsId: string
  view: FeedStyle
  thumbnailUrls?: Record<string, string>
  embeds?: Record<string, UrlEmbed>
}

export function NewsItemClusterRelatedItems({
  isExpanded,
  renderActions,
  renderOfficialBadge,
  setExpanded,
  storyItemActionContexts,
  storyItems,
  storyItemsId,
  view,
  thumbnailUrls,
  embeds,
}: NewsItemClusterRelatedItemsProps) {
  const isHydrated = useDidHydrate()

  return (
    <div className='border-t border-border/50'>
      <div className='px-4 py-2'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground'
          onClick={() => setExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls={storyItemsId}
          disabled={!isHydrated}
          data-pw='news-item-cluster-related-toggle'
        >
          {isExpanded ? (
            <ChevronUp className='mr-1 h-3 w-3' />
          ) : (
            <ChevronDown className='mr-1 h-3 w-3' />
          )}
          {isExpanded
            ? 'Hide articles'
            : `${storyItems.length} related article${storyItems.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
      <div
        id={storyItemsId}
        hidden={!isExpanded}
      >
        {storyItems.map(item => {
          const context = storyItemActionContexts[item.id]
          return (
            <div
              key={item.id}
              className='border-t border-border/50'
            >
              <NewsItemCard
                item={item}
                view={view}
                bare
                badge={renderOfficialBadge(item)}
                thumbnailUrl={thumbnailUrls?.[item.id]}
                embed={embeds?.[item.id]}
                footer={modalHref =>
                  renderActions({
                    item,
                    modalHref,
                    election: context?.election,
                    electionVote: context?.electionVote,
                    itemRelatedPosts: context?.relatedPosts ?? [],
                    itemViewerBookmarks: context?.viewerBookmarks,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
