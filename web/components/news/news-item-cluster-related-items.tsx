'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewsItemCard } from '@/components/feed/news-item-card'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { useTranslations } from '@/lib/i18n/use-translations'
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
  hasMoreStoryItems?: boolean
  loadingStoryItems?: boolean
  storyLoadError?: boolean
  onLoadStoryMore?: () => void | Promise<void>
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
  hasMoreStoryItems = false,
  loadingStoryItems = false,
  storyLoadError = false,
  onLoadStoryMore,
  storyItemsId,
  view,
  thumbnailUrls,
  embeds,
}: NewsItemClusterRelatedItemsProps) {
  const isHydrated = useDidHydrate()
  const t = useTranslations()

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
          {t(
            hasMoreStoryItems
              ? 'extracted.news.newsItemClusterRelatedItems.relatedArticlesMore'
              : 'extracted.news.newsItemClusterRelatedItems.relatedArticles',
            { count: storyItems.length },
          )}
        </Button>
      </div>
      <div
        id={storyItemsId}
        hidden={!isExpanded}
        data-pw='news-item-cluster-related-panel'
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
        {hasMoreStoryItems && onLoadStoryMore && (
          <div className='border-t border-border/50 px-4 py-2'>
            {storyLoadError && (
              <p
                role='alert'
                className='text-xs text-destructive'
              >
                {t('extracted.news.newsItemClusterRelatedItems.loadError')}
              </p>
            )}
            <Button
              type='button'
              variant='ghost'
              size='sm'
              disabled={loadingStoryItems}
              onClick={onLoadStoryMore}
              data-pw='news-item-cluster-related-load-more'
            >
              {loadingStoryItems
                ? t('extracted.news.newsItemClusterRelatedItems.loading')
                : storyLoadError
                  ? t('extracted.news.newsItemClusterRelatedItems.retry')
                  : t('extracted.news.newsItemClusterRelatedItems.loadMore')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
