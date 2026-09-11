'use client'

// oxlint-disable eslint/max-lines -- this module owns the complete news-item action surface
import { type ReactNode, useState } from 'react'
import { NewsDiscussMenu } from '@/components/news/news-discuss-menu'
import { useStartDiscussionAction } from '@/components/news/use-start-discussion-action'
import { HideButton, HideMenuItem } from '@/components/shared/hide-button'
import { SaveButton, SaveMenuItem } from '@/components/shared/save-button'
import { ReportMenuItem } from '@/components/shared/report-menu-item'
import { ManageCategoriesMenuItem } from '@/components/feed/manage-categories-menu-item'
import { AddToListMenuItem } from '@/components/lists/add-to-list-menu-item'
import { FollowerShareActions } from '@/components/shared/follower-share-actions'
import { clearRssFeedItemVote, submitRssFeedItemVote } from '@/lib/api/client/elections'
import { ScoreVote } from '@/components/votes/score-vote'
import type { RssFeedItem, RssFeedItemElection } from '@/types/rss-feed-items'
import type { ElectionVote, Post } from '@/types/posts'
import { ShowMoreLink } from './news-item-cluster-meta'
import type {
  NewsCommunityDiscussionTarget,
  NewsCommunityDiscussionUrl,
} from './community-discussion-types'
import { getStartDiscussionActionProps } from './get-start-discussion-action-props'
import { useAuth } from '@/lib/auth/context'

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

interface NewsItemModalFooterActionsProps {
  bookmarkProps: { entityType: 'rss_feed_item'; entityId: string }
  relatedPosts: Post[]
  communityDiscussionTarget?: NewsCommunityDiscussionTarget
  communityDiscussionUrls: NewsCommunityDiscussionUrl[]
  relatedUrlId: string
  initialHidden: boolean
  initialSaved: boolean
  hasStoryPost?: boolean
  itemTitle?: string | null
  vote: ReactNode
}

function NewsItemModalFooterActions({
  bookmarkProps,
  relatedPosts,
  communityDiscussionTarget,
  communityDiscussionUrls,
  relatedUrlId,
  initialHidden,
  initialSaved,
  hasStoryPost,
  itemTitle,
  vote,
}: NewsItemModalFooterActionsProps) {
  const { isAuthenticated: isLoggedIn } = useAuth()
  const resetKey = `${bookmarkProps.entityId}:${initialHidden}:${initialSaved}`
  const initialModalState = {
    key: resetKey,
    hidden: initialHidden,
    saved: initialSaved,
    hidePending: false,
    savePending: false,
  }
  const [storedModalState, setStoredModalState] = useState(initialModalState)
  let modalState = storedModalState
  if (storedModalState.key !== resetKey) {
    modalState = initialModalState
    setStoredModalState(initialModalState)
  }
  const setModalField =
    (field: 'hidden' | 'saved' | 'hidePending' | 'savePending') => (value: boolean) => {
      setStoredModalState(current => ({
        ...(current.key === resetKey ? current : initialModalState),
        [field]: value,
      }))
    }
  const { hidden: modalHidden, saved: modalSaved } = modalState
  const { hidePending: modalHidePending, savePending: modalSavePending } = modalState
  const setModalHidden = setModalField('hidden')
  const setModalSaved = setModalField('saved')
  const setModalHidePending = setModalField('hidePending')
  const setModalSavePending = setModalField('savePending')

  const startDiscussionAction = useStartDiscussionAction(
    getStartDiscussionActionProps({ isLoggedIn, hasStoryPost, relatedUrlId }),
  )
  const hasMenuActions = isLoggedIn

  return (
    <div className='flex min-w-0 items-center justify-center gap-1'>
      {vote}
      {/* Unified discuss menu — visible on all screen sizes */}
      <NewsDiscussMenu
        relatedPosts={relatedPosts}
        hasStoryPost={hasStoryPost}
        relatedUrlId={relatedUrlId}
        communityDiscussionTarget={communityDiscussionTarget}
        communityDiscussionUrls={communityDiscussionUrls}
        itemTitle={itemTitle}
        startDiscussionAction={startDiscussionAction}
      />
      {/* Mobile: single ... with Hide/Save/ManageCategories/Report */}
      {isLoggedIn && (
        <FollowerShareActions
          compact
          entityType='rss_feed_item'
          entityId={bookmarkProps.entityId}
          dataPw='rss-feed-item-modal-more-actions-button'
          menuLeadingItems={
            <>
              <SaveMenuItem
                {...bookmarkProps}
                initialActive={initialSaved}
                active={modalSaved}
                onActiveChange={setModalSaved}
                pending={modalSavePending}
                onPendingChange={setModalSavePending}
              />
              <AddToListMenuItem
                itemType='rss_feed_item'
                entityId={bookmarkProps.entityId}
              />
              <HideMenuItem
                {...bookmarkProps}
                initialActive={initialHidden}
                active={modalHidden}
                onActiveChange={setModalHidden}
                pending={modalHidePending}
                onPendingChange={setModalHidePending}
              />
              <ManageCategoriesMenuItem entityId={bookmarkProps.entityId} />
              <ReportMenuItem
                entityType='rss_feed_item'
                entityId={bookmarkProps.entityId}
              />
            </>
          }
          className='sm:hidden'
        />
      )}
      {/* Desktop: inline Hide/Save + ... with Share/Report */}
      {hasMenuActions && (
        <div className='hidden min-w-0 items-center justify-center gap-1 overflow-x-auto scrollbar-hide sm:flex'>
          {isLoggedIn && (
            <SaveButton
              {...bookmarkProps}
              initialActive={initialSaved}
              active={modalSaved}
              onActiveChange={setModalSaved}
              pending={modalSavePending}
              onPendingChange={setModalSavePending}
            />
          )}
          {isLoggedIn && (
            <HideButton
              {...bookmarkProps}
              initialActive={initialHidden}
              active={modalHidden}
              onActiveChange={setModalHidden}
              pending={modalHidePending}
              onPendingChange={setModalHidePending}
            />
          )}
          {isLoggedIn && (
            <FollowerShareActions
              compact
              entityType='rss_feed_item'
              entityId={bookmarkProps.entityId}
              menuLeadingItems={
                <>
                  <ManageCategoriesMenuItem entityId={bookmarkProps.entityId} />
                  <ReportMenuItem
                    entityType='rss_feed_item'
                    entityId={bookmarkProps.entityId}
                  />
                </>
              }
            />
          )}
        </div>
      )}
    </div>
  )
}
