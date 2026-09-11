// no-mistakes-disable-file playwright-unique-test-ids -- single-action and multi-action branches are mutually exclusive; same data-pw literals appear in each branch
// oxlint-disable no-mistakes/playwright-unique -- single-action and multi-action branches are mutually exclusive; same data-pw literals appear in each branch
'use client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { UsernameRequiredDialog } from '@/components/shared/username-required-dialog'
import type { Post } from '@/types/posts'
import { getPostSlugFromType } from '@/lib/route-configs'
import { getPostPath } from '@/lib/post-helpers'
import { type StartDiscussionAction, useStartDiscussionAction } from './use-start-discussion-action'
import { useViewerHasCommunity } from './use-viewer-has-community'
import { NewsCommunityDiscussionAction } from './news-community-discussion-action'
import type {
  NewsCommunityDiscussionTarget,
  NewsCommunityDiscussionUrl,
} from './community-discussion-types'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useAuth } from '@/lib/auth/context'
import { NewsDiscussionTitle } from './news-discussion-title'

interface NewsDiscussMenuProps {
  relatedPosts: Post[]
  hasStoryPost?: boolean
  relatedUrlId?: string
  communityDiscussionTarget?: NewsCommunityDiscussionTarget
  communityDiscussionUrls: NewsCommunityDiscussionUrl[]
  itemTitle?: string | null
  startDiscussionAction?: StartDiscussionAction
}

export function NewsDiscussMenu({
  relatedPosts,
  hasStoryPost,
  relatedUrlId,
  communityDiscussionTarget,
  communityDiscussionUrls,
  itemTitle,
  startDiscussionAction,
}: NewsDiscussMenuProps) {
  const t = useTranslations()
  const { isAuthenticated: isLoggedIn } = useAuth()
  const canDiscuss = isLoggedIn && !hasStoryPost && !!relatedUrlId
  const viewerHasCommunity = useViewerHasCommunity(isLoggedIn)
  const canDiscussWithCommunity = isLoggedIn && (!!communityDiscussionTarget || viewerHasCommunity)
  const n = relatedPosts.length
  const totalActions = n + (canDiscuss ? 1 : 0) + (canDiscussWithCommunity ? 1 : 0)

  const localAction = useStartDiscussionAction(
    canDiscuss && !startDiscussionAction ? { urlId: relatedUrlId } : null,
  )
  const {
    handleStartDiscussion,
    isCreating,
    usernameDialogOpen,
    handleUsernameSet,
    handleUsernameClose,
  } = startDiscussionAction ?? localAction

  if (totalActions === 0) return null

  const DiscussIcon = EntityActionIcons.startDiscussion
  const DiscussionLinkIcon = EntityActionIcons.discussionLink
  const triggerLabel =
    n === 0
      ? t('extracted.news.newsDiscussMenu.discuss_3df75fc7')
      : `${n} ${n === 1 ? 'Post' : 'Posts'}`
  const TriggerIcon = n === 0 ? DiscussIcon : DiscussionLinkIcon
  const buttonClass = 'min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground'

  const usernameDialog = (
    <UsernameRequiredDialog
      open={usernameDialogOpen}
      onUsernameSet={handleUsernameSet}
      onClose={handleUsernameClose}
      title={t('extracted.news.newsDiscussMenu.createAUsernameToStartA_29ac2bb4')}
      submitLabel={t('extracted.news.newsDiscussMenu.createUsernameDiscuss_29677f55')}
    />
  )

  if (totalActions === 1 && canDiscuss && n === 0) {
    return (
      <>
        <Button
          variant='ghost'
          size='sm'
          data-pw='news-discuss-button'
          className={buttonClass}
          disabled={isCreating}
          onClick={() => {
            void handleStartDiscussion()
          }}
        >
          <DiscussIcon data-icon='inline-start' />
          {isCreating
            ? t('extracted.news.newsDiscussMenu.creating_def70944')
            : t('extracted.news.newsDiscussMenu.discuss_3df75fc7')}
        </Button>
        {usernameDialog}
      </>
    )
  }

  if (totalActions === 1 && n === 1 && !canDiscuss && !canDiscussWithCommunity) {
    const post = relatedPosts[0]!
    return (
      <Button
        variant='ghost'
        size='sm'
        data-pw='news-discuss-button'
        className={buttonClass}
        asChild
      >
        <Link
          href={getPostPath(getPostSlugFromType(post.post_type), post)}
          prefetch={false}
        >
          <DiscussionLinkIcon data-icon='inline-start' />
          <NewsDiscussionTitle
            post={post}
            fallback={t('extracted.news.newsDiscussMenu.discuss_3df75fc7')}
          />
        </Link>
      </Button>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            data-pw='news-discuss-button'
            className={buttonClass}
          >
            <TriggerIcon data-icon='inline-start' />
            {triggerLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {relatedPosts.map(post => (
            <DropdownMenuItem
              key={post.id}
              asChild
            >
              <Link
                href={getPostPath(getPostSlugFromType(post.post_type), post)}
                prefetch={false}
              >
                <DiscussionLinkIcon />
                <NewsDiscussionTitle
                  post={post}
                  fallback={t('extracted.news.newsDiscussMenu.untitledDiscussion_50b9322b')}
                />
              </Link>
            </DropdownMenuItem>
          ))}
          {n > 0 && (canDiscuss || canDiscussWithCommunity) && <DropdownMenuSeparator />}
          {canDiscuss && (
            <DropdownMenuItem
              data-pw='news-discuss-create-item'
              disabled={isCreating}
              onSelect={(event: Event) => {
                event.preventDefault()
                void handleStartDiscussion()
              }}
            >
              <DiscussIcon />
              {isCreating
                ? t('extracted.news.newsDiscussMenu.creating_def70944')
                : t('extracted.news.newsDiscussMenu.discuss_3df75fc7')}
            </DropdownMenuItem>
          )}
          {canDiscussWithCommunity && (
            <NewsCommunityDiscussionAction
              variant='menu-item'
              fixedCommunity={communityDiscussionTarget}
              relatedUrls={communityDiscussionUrls}
              itemTitle={itemTitle}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {usernameDialog}
    </>
  )
}
