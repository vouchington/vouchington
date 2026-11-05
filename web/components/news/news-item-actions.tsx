'use client'

import type { ReactNode } from 'react'
import { NewsDiscussMenu } from '@/components/news/news-discuss-menu'
import { HideButton } from '@/components/shared/hide-button'
import { SaveButton } from '@/components/shared/save-button'
import { clearRssFeedItemVote, submitRssFeedItemVote } from '@/lib/api/client/elections'
import { ScoreVote } from '@/components/votes/score-vote'
import type { RssFeedItem, RssFeedItemElection } from '@/types/rss-feed-items'
import type { ElectionVote, Post } from '@/types/posts'
import { ShowMoreLink } from './news-item-cluster-meta'
import type {
  NewsCommunityDiscussionTarget,
  NewsCommunityDiscussionUrl,
} from './community-discussion-types'
import { useAuth } from '@/lib/auth/context'
import { NewsItemModalFooterActions } from './news-item-modal-footer-actions'

interface NewsItemActionsProps {
  item: RssFeedItem
  election?: RssFeedItemElection | null
  electionVote?: ElectionVote | null
  relatedPosts: Post[]
  communityDiscussionTarget?: NewsCommunityDiscussionTarget
  communityDiscussionUrls?: NewsCommunityDiscussionUrl[]
  viewerBookmarks?: Record<string, boolean>
  leadingHref?: string
  /** Rendered as the first child (e.g. a Show more link in list view). */
  leadingAction?: ReactNode
  /** Rendered as the last child with ml-auto (e.g. Next button in modal). */
  trailingAction?: ReactNode
  variant?: 'row' | 'modal-footer'
  hasStoryPost?: boolean
}

export function NewsItemActions({
  item,
  election,
  electionVote,
  relatedPosts,
  communityDiscussionTarget,
  communityDiscussionUrls,
  viewerBookmarks,
  leadingHref,
  leadingAction,
  trailingAction,
  variant = 'row',
  hasStoryPost,
}: NewsItemActionsProps) {
  const { isAuthenticated: isLoggedIn } = useAuth()
  const bookmarkProps = { entityType: 'rss_feed_item' as const, entityId: item.id }
  const effectiveCommunityUrls = communityDiscussionUrls ?? [{ id: item.url.id, url: item.url.url }]
  const sharedVoteProps = election
    ? {
        entityType: 'rss_feed_item' as const,
        electionId: election.id,
        countUp: election.votes_count_up,
        countDown: election.votes_count_down,
        existingVoteChoice: electionVote?.choice as
          | import('@/lib/api/client/elections').SentimentChoice
          | undefined,
        submitVote: (_id: string, choice: import('@/lib/api/client/elections').SentimentChoice) =>
          submitRssFeedItemVote(
            item.id,
            choice as import('@/lib/api/client/elections').SentimentChoice,
          ),
        clearVote: () => clearRssFeedItemVote(item.id),
        signedOut: !isLoggedIn,
      }
    : null

  if (variant === 'modal-footer') {
    return (
      <NewsItemModalFooterActions
        bookmarkProps={bookmarkProps}
        relatedPosts={relatedPosts}
        communityDiscussionTarget={communityDiscussionTarget}
        communityDiscussionUrls={effectiveCommunityUrls}
        relatedUrlId={item.url.id}
        initialHidden={viewerBookmarks?.hide === true}
        initialSaved={viewerBookmarks?.save === true}
        hasStoryPost={hasStoryPost}
        itemTitle={item.data.title}
        vote={
          sharedVoteProps ? (
            <ScoreVote
              {...sharedVoteProps}
              data-pw='news-item-modal-vote'
            />
          ) : null
        }
      />
    )
  }

  return (
    <div
      data-pw='news-item-actions-row'
      className='flex items-center gap-1 overflow-x-auto scrollbar-hide'
    >
      {leadingHref ? <ShowMoreLink href={leadingHref} /> : null}
      {leadingAction}
      {sharedVoteProps ? (
        <ScoreVote
          {...sharedVoteProps}
          data-pw='news-item-vote'
        />
      ) : null}
      {isLoggedIn && (
        <SaveButton
          {...bookmarkProps}
          initialActive={viewerBookmarks?.save === true}
        />
      )}
      {isLoggedIn && (
        <HideButton
          {...bookmarkProps}
          initialActive={viewerBookmarks?.hide === true}
        />
      )}
      <NewsDiscussMenu
        relatedPosts={relatedPosts}
        hasStoryPost={hasStoryPost}
        relatedUrlId={item.url.id}
        communityDiscussionTarget={communityDiscussionTarget}
        communityDiscussionUrls={effectiveCommunityUrls}
        itemTitle={item.data.title}
      />
      {trailingAction && <div className='ml-auto'>{trailingAction}</div>}
    </div>
  )
}
