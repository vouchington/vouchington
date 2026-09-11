'use client'

import type { ReactNode } from 'react'
import { FollowerShareActionButtons } from './follower-share-action-buttons'
import { FollowerSendDialog } from './follower-send-dialog'
import { useFollowerShareActions } from './use-follower-share-actions'
import { useAuth } from '@/lib/auth/context'

interface FollowerShareActionsProps {
  entityType: 'post' | 'rss_feed_item'
  entityId: string
  ownerUserId?: string | null
  hidden?: boolean
  compact?: boolean
  className?: string
  /** Additional menu items rendered at the top of the compact dropdown, before the share actions. */
  menuLeadingItems?: ReactNode
  /** Override the `data-pw` attribute on the compact trigger button. */
  dataPw?: string
}

export function FollowerShareActions({
  entityType,
  entityId,
  ownerUserId,
  hidden = false,
  compact = false,
  className,
  menuLeadingItems,
  dataPw,
}: FollowerShareActionsProps) {
  const { currentUser, isAuthenticated } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const actions = useFollowerShareActions({ currentUserId, entityId, entityType })

  if (!isAuthenticated || hidden || ownerUserId === currentUserId || !currentUserId) {
    return null
  }

  return (
    <>
      <FollowerShareActionButtons
        className={className}
        compact={compact}
        isSharePending={actions.isSharePending}
        onSendOpen={actions.handleSendDialogOpen}
        onShare={actions.handleShare}
        menuLeadingItems={menuLeadingItems}
        dataPw={dataPw}
      />
      <FollowerSendDialog
        open={actions.isDialogOpen}
        audience={actions.audience}
        currentUserId={currentUserId}
        isSendPending={actions.isSendPending}
        selectedFollowers={actions.selectedFollowers}
        onAudienceChange={actions.handleAudienceChange}
        onOpenChange={open => actions.resetDialogState(open)}
        onSend={() => actions.handleSend().catch(() => undefined)}
        onToggleFollowerSelection={follower => actions.toggleFollowerSelection(follower)}
      />
    </>
  )
}
