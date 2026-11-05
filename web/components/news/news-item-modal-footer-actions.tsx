'use client'

import { type ReactNode, useState } from 'react'
import { NewsDiscussMenu } from '@/components/news/news-discuss-menu'
import { useStartDiscussionAction } from '@/components/news/use-start-discussion-action'
import { HideButton, HideMenuItem } from '@/components/shared/hide-button'
import { SaveButton, SaveMenuItem } from '@/components/shared/save-button'
import { ReportMenuItem } from '@/components/shared/report-menu-item'
import { ManageCategoriesMenuItem } from '@/components/feed/manage-categories-menu-item'
import { AddToListMenuItem } from '@/components/lists/add-to-list-menu-item'
import { FollowerShareActions } from '@/components/shared/follower-share-actions'
import type { Post } from '@/types/posts'
import { useAuth } from '@/lib/auth/context'
import type {
  NewsCommunityDiscussionTarget,
  NewsCommunityDiscussionUrl,
} from './community-discussion-types'
import { getStartDiscussionActionProps } from './get-start-discussion-action-props'

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

export function NewsItemModalFooterActions({
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
