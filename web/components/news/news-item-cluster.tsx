// oxlint-disable react-doctor/no-render-prop-children -- render-prop pattern required for item-specific action context
'use client'

import { useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { NewsItemCard } from '@/components/feed/news-item-card'
import { NewsItemActions } from '@/components/news/news-item-actions'
import type { RssFeedItem, RssFeedItemElection, Story } from '@/types/rss-feed-items'
import type { ElectionVote, Post } from '@/types/posts'
import type { FeedStyle } from '@/lib/preferences/shared'
import type { PublicUser } from '@/types/user'
import { getPostPath } from '@/lib/post-helpers'
import { getPostSlugFromType } from '@/lib/route-configs'
import { NewsItemStoryCard } from './news-item-cluster-story-card'
import type { NewsItemActionContext, RenderActionsParams } from './news-item-cluster-related-items'
import type {
  NewsCommunityDiscussionTarget,
  NewsCommunityDiscussionUrl,
} from './community-discussion-types'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'

interface NewsItemClusterProps {
  primary: RssFeedItem
  primaryElection?: RssFeedItemElection | null
  primaryElectionVote?: ElectionVote | null
  storyItems: RssFeedItem[]
  story?: Story
  storyPost?: Post
  view: FeedStyle
  relatedPosts?: Post[]
  communityDiscussionTarget?: NewsCommunityDiscussionTarget
  viewerBookmarks?: Record<string, boolean>
  storyRelatedUrlIds?: string[]
  thumbnailUrls?: Record<string, string>
  embeds?: Record<string, UrlEmbed>
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  storyItemActionContexts?: Record<string, NewsItemActionContext>
  sharedByUser?: PublicUser
  sharedAt?: string
}

const EMPTY_STORY_ITEM_ACTION_CONTEXTS: NonNullable<
  NewsItemClusterProps['storyItemActionContexts']
> = {}
const EMPTY_RELATED_POSTS: Post[] = []

export function NewsItemCluster({
  primary,
  primaryElection,
  primaryElectionVote,
  storyItems,
  story,
  storyPost,
  view,
  relatedPosts = EMPTY_RELATED_POSTS,
  communityDiscussionTarget,
  viewerBookmarks,
  storyRelatedUrlIds,
  thumbnailUrls,
  embeds,
  expanded,
  onExpandedChange,
  storyItemActionContexts = EMPTY_STORY_ITEM_ACTION_CONTEXTS,
  sharedByUser,
  sharedAt,
}: NewsItemClusterProps) {
  const t = useTranslations()
  const [localExpanded, setLocalExpanded] = useState(false)
  const storyItemsId = useId()
  const isExpanded = expanded ?? localExpanded

  const allStoryRelatedUrlIds = [
    ...new Set(storyRelatedUrlIds ?? [primary.url.id, ...storyItems.map(i => i.url.id)]),
  ]
  const allStoryRelatedUrls = getRelatedUrls([primary, ...storyItems], allStoryRelatedUrlIds)

  const setExpanded = (nextExpanded: boolean) => {
    if (expanded === undefined) setLocalExpanded(nextExpanded)
    onExpandedChange?.(nextExpanded)
  }

  const filteredRelatedPosts = storyPost
    ? relatedPosts.filter(p => p.id !== storyPost.id)
    : relatedPosts

  const filteredStoryItemActionContexts = storyPost
    ? Object.fromEntries(
        Object.entries(storyItemActionContexts).map(([id, ctx]) => [
          id,
          { ...ctx, relatedPosts: ctx.relatedPosts.filter(p => p.id !== storyPost.id) },
        ]),
      )
    : storyItemActionContexts

  const renderOfficialBadge = (item: RssFeedItem) =>
    story?.official_rss_feed_item_id === item.id ? (
      <Badge
        variant='outline'
        className='w-fit text-xs'
      >
        {t('extracted.news.newsItemCluster.officialSource_a0d02d2d')}
      </Badge>
    ) : null

  const renderActions = ({
    item,
    modalHref,
    election,
    electionVote,
    itemRelatedPosts,
    itemViewerBookmarks,
  }: RenderActionsParams) => (
    <NewsItemActions
      item={item}
      election={election}
      electionVote={electionVote}
      relatedPosts={itemRelatedPosts}
      communityDiscussionTarget={communityDiscussionTarget}
      communityDiscussionUrls={allStoryRelatedUrls}
      viewerBookmarks={itemViewerBookmarks}
      leadingHref={modalHref}
      hasStoryPost={!!storyPost}
    />
  )

  const renderPrimaryActions = (modalHref: string) => (
    <NewsItemActions
      item={primary}
      election={primaryElection}
      electionVote={primaryElectionVote}
      relatedPosts={filteredRelatedPosts}
      communityDiscussionTarget={communityDiscussionTarget}
      communityDiscussionUrls={allStoryRelatedUrls}
      viewerBookmarks={viewerBookmarks}
      leadingHref={modalHref}
      hasStoryPost={!!storyPost}
    />
  )

  const storyPostHref = storyPost
    ? getPostPath(getPostSlugFromType(storyPost.post_type), storyPost)
    : null

  const hasStoryHeader = !!(story?.title || story?.published_at || story?.cluster_reason)
  if (storyItems.length === 0 && !hasStoryHeader) {
    return (
      <NewsItemCard
        item={primary}
        view={view}
        badge={story ? renderOfficialBadge(primary) : null}
        thumbnailUrl={thumbnailUrls?.[primary.id]}
        embed={embeds?.[primary.id]}
        sharedByUser={sharedByUser}
        sharedAt={sharedAt}
        footer={renderPrimaryActions}
      />
    )
  }

  return (
    <NewsItemStoryCard
      filteredStoryItemActionContexts={filteredStoryItemActionContexts}
      isExpanded={isExpanded}
      primary={primary}
      renderActions={renderActions}
      renderOfficialBadge={renderOfficialBadge}
      renderPrimaryActions={renderPrimaryActions}
      setExpanded={setExpanded}
      sharedAt={sharedAt}
      sharedByUser={sharedByUser}
      story={story}
      storyItems={storyItems}
      storyItemsId={storyItemsId}
      storyPostHref={storyPostHref}
      view={view}
      thumbnailUrls={thumbnailUrls}
      embeds={embeds}
    />
  )
}

function getRelatedUrls(items: RssFeedItem[], urlIds: string[]): NewsCommunityDiscussionUrl[] {
  const urlsById = new Map(items.map(item => [item.url.id, item.url.url]))
  return urlIds.flatMap(id => {
    const url = urlsById.get(id)
    return url ? [{ id, url }] : []
  })
}
