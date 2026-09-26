'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { NewsItemCard } from '@/components/feed/news-item-card'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import type { RssFeedItem, Story } from '@/types/rss-feed-items'
import type { FeedStyle } from '@/lib/preferences/shared'
import type { PublicUser } from '@/types/user'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'
import { StoryMeta } from './news-item-cluster-meta'
import {
  NewsItemClusterRelatedItems,
  type NewsItemActionContext,
  type RenderActionsParams,
} from './news-item-cluster-related-items'
import { useStartStoryDiscussionAction } from './use-start-story-discussion-action'
import { useAuth } from '@/lib/auth/context'

interface NewsItemStoryCardProps {
  story?: Story
  storyPostHref: string | null
  onStoryDiscussionCreated?: (href: string) => void
  storyItems: RssFeedItem[]
  primary: RssFeedItem
  view: FeedStyle
  sharedByUser?: PublicUser
  sharedAt?: string
  isExpanded: boolean
  setExpanded: (expanded: boolean) => void
  storyItemsId: string
  renderOfficialBadge: (item: RssFeedItem) => ReactNode | null
  renderPrimaryActions: (modalHref: string) => ReactNode
  renderActions: (args: RenderActionsParams) => ReactNode
  filteredStoryItemActionContexts: Record<string, NewsItemActionContext>
  thumbnailUrls?: Record<string, string>
  embeds?: Record<string, UrlEmbed>
}

export function NewsItemStoryCard({
  story,
  storyPostHref,
  onStoryDiscussionCreated,
  storyItems,
  primary,
  view,
  sharedByUser,
  sharedAt,
  isExpanded,
  setExpanded,
  storyItemsId,
  renderOfficialBadge,
  renderPrimaryActions,
  renderActions,
  filteredStoryItemActionContexts,
  thumbnailUrls,
  embeds,
}: NewsItemStoryCardProps) {
  const { isAuthenticated: isLoggedIn } = useAuth()
  const canCreateStoryPost = isLoggedIn && !storyPostHref && storyItems.length > 0 && !!story?.id
  const storyDiscussionAction = useStartStoryDiscussionAction(
    canCreateStoryPost && story?.id
      ? {
          storyId: story.id,
          fallbackUrlId: primary.url.id,
          onCreated: onStoryDiscussionCreated,
        }
      : null,
  )
  const DiscussIcon = EntityActionIcons.startDiscussion
  return (
    <Card
      className='relative'
      data-pw='news-item-cluster'
    >
      {(story?.title || story?.published_at || story?.cluster_reason || canCreateStoryPost) && (
        <CardHeader className='pb-2'>
          {story?.title &&
            (storyPostHref ? (
              <Link
                href={storyPostHref}
                prefetch={false}
                className='text-sm font-medium hover:underline'
              >
                {story.title}
              </Link>
            ) : (
              <p className='text-sm font-medium text-foreground'>{story.title}</p>
            ))}
          <StoryMeta story={story} />
          {canCreateStoryPost && (
            <Button
              variant='ghost'
              size='sm'
              data-pw='news-item-cluster-discuss-story'
              className='h-auto w-fit px-2 py-1 text-xs text-muted-foreground hover:text-foreground'
              disabled={storyDiscussionAction.isCreating}
              onClick={() => {
                void storyDiscussionAction.handleStartStoryDiscussion()
              }}
            >
              <DiscussIcon data-icon='inline-start' />
              {storyDiscussionAction.isCreating ? 'Creating...' : 'Discuss the full story'}
            </Button>
          )}
        </CardHeader>
      )}

      <CardContent className='space-y-0 pb-0 pt-0'>
        <div className='border-t border-border/50'>
          <NewsItemCard
            item={primary}
            view={view}
            bare
            badge={renderOfficialBadge(primary)}
            sharedByUser={sharedByUser}
            sharedAt={sharedAt}
            thumbnailUrl={thumbnailUrls?.[primary.id]}
            embed={embeds?.[primary.id]}
            footer={renderPrimaryActions}
          />
        </div>

        {storyItems.length > 0 && (
          <NewsItemClusterRelatedItems
            isExpanded={isExpanded}
            renderActions={renderActions}
            renderOfficialBadge={renderOfficialBadge}
            setExpanded={setExpanded}
            storyItemActionContexts={filteredStoryItemActionContexts}
            storyItems={storyItems}
            storyItemsId={storyItemsId}
            view={view}
            thumbnailUrls={thumbnailUrls}
            embeds={embeds}
          />
        )}
      </CardContent>
    </Card>
  )
}
