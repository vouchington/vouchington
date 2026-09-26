'use client'

import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ReportMenuItem } from '@/components/shared/report-menu-item'
import { FollowerSendDialog } from '@/components/shared/follower-send-dialog'
import { useFollowerShareActions } from '@/components/shared/use-follower-share-actions'
import { createPostPathname } from '@/lib/links/entity-href'
import { getPostSlugFromType } from '@/lib/route-configs'
import { useAuth } from '@/lib/auth/context'
import { getPostOverflowVisibility } from './post-detail-overflow-guard'
import type { PostDetailOverflowMenuProps } from './post-detail-overflow-types'
import { FollowerShareMenuItems } from './follower-share-menu-items'
import { DeletePostMenuItem } from './delete-post-menu-item'
import { PostLockMenuItem } from './post-lock-menu-item'
import { UnpublishFromCommunityMenuItem } from './unpublish-from-community-menu-item'
import { PinCommunityPostMenuItem } from './pin-community-post-menu-item'
import { useTranslations } from '@/lib/i18n/use-translations'

export function PostDetailOverflowMenu({
  post,
  communitySlug,
  isCommunityMod,
  isPostPinned,
  className,
}: PostDetailOverflowMenuProps) {
  const t = useTranslations()
  const auth = useAuth()
  const currentUserId = auth.currentUser?.id ?? null
  const isAuthenticated = auth.isAuthenticated
  const isOwner = currentUserId != null && currentUserId === post.created_by_id
  const isAdmin = auth.currentUser?.roles.includes('administrator') ?? false
  const {
    canShare: showShare,
    canReport: showReport,
    canEdit,
    canDelete: showDelete,
    canLock: showLock,
    canUnpublish: showUnpublish,
  } = getPostOverflowVisibility(post, { isAuthenticated, isOwner, isAdmin, currentUserId })

  const showPin = !!(isCommunityMod && communitySlug && post.can_unpublish_from_community)

  const hasGroup1 = showShare
  const hasGroup2 = showReport || canEdit
  const hasGroup3 = showDelete || showLock || showUnpublish || showPin

  const hasAnyItem = hasGroup1 || hasGroup2 || hasGroup3

  const entityId = post.slug ?? post.id
  const actions = useFollowerShareActions({
    currentUserId: currentUserId,
    entityId,
    entityType: 'post',
  })

  if (!hasAnyItem) return null

  return (
    <div className={className}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='min-h-11 min-w-11 p-0'
            aria-label={t('extracted.posts.postDetailOverflowMenu.moreActions_f8d46c25')}
            data-pw='post-detail-overflow-trigger'
          >
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {hasGroup1 && (
            <FollowerShareMenuItems
              isSharePending={actions.isSharePending}
              onShare={actions.handleShare}
              onSendOpen={actions.handleSendDialogOpen}
            />
          )}
          {hasGroup1 && hasGroup2 && <DropdownMenuSeparator />}
          {canEdit && (
            <DropdownMenuItem asChild>
              <Link
                prefetch={false}
                href={createPostPathname(getPostSlugFromType(post.post_type), post, '/edit')}
                data-pw='post-edit-button'
              >
                {t('extracted.posts.postDetailOverflowMenu.edit_464c4ffd')}
              </Link>
            </DropdownMenuItem>
          )}
          {showReport && (
            <ReportMenuItem
              entityType='post'
              entityId={post.id}
            />
          )}
          {(hasGroup1 || hasGroup2) && hasGroup3 && <DropdownMenuSeparator />}
          {showLock && (
            <PostLockMenuItem
              postIdOrSlug={post.slug ?? post.id}
              lockedAt={post.locked_at}
            />
          )}
          {showUnpublish && post.community_id != null && (
            <UnpublishFromCommunityMenuItem
              communityId={post.community_id}
              postId={post.id}
            />
          )}
          {showPin && communitySlug && (
            <PinCommunityPostMenuItem
              postId={post.id}
              communitySlug={communitySlug}
              isPinned={isPostPinned ?? false}
            />
          )}
          {showDelete && <DeletePostMenuItem postIdOrSlug={post.slug ?? post.id} />}
        </DropdownMenuContent>
      </DropdownMenu>
      {showShare && currentUserId && (
        <FollowerSendDialog
          open={actions.isDialogOpen}
          audience={actions.audience}
          currentUserId={currentUserId}
          isSendPending={actions.isSendPending}
          selectedFollowers={actions.selectedFollowers}
          onAudienceChange={actions.handleAudienceChange}
          onOpenChange={open => actions.resetDialogState(open)}
          onSend={() => actions.handleSend().catch(Sentry.captureException)}
          onToggleFollowerSelection={follower => actions.toggleFollowerSelection(follower)}
        />
      )}
    </div>
  )
}
