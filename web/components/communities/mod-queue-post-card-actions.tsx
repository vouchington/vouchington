'use client'

import { AlertTriangle, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CommunityPostsResponseBody } from '@/types/api-responses'
import type { ModQueuePostActions } from './use-mod-queue-post-actions'

type PendingPost = CommunityPostsResponseBody['posts'][string]

export function ModQueuePostCardActions({
  activeAction,
  bulkDisabled,
  currentUserId,
  loading,
  onApprove,
  onCancelReject,
  onRejectStart,
  onRejectSubmit,
  onRejectionReasonChange,
  post,
  postActions,
  rejectionReason,
}: {
  activeAction: { postId: string; type: 'reject' } | null
  bulkDisabled: boolean
  currentUserId: string | null
  loading: string | null
  onApprove: (postId: string) => void
  onCancelReject: () => void
  onRejectStart: (postId: string) => void
  onRejectSubmit: (postId: string) => void
  onRejectionReasonChange: (value: string) => void
  post: PendingPost
  postActions: ModQueuePostActions
  rejectionReason: string
}) {
  const t = useTranslations()
  const { claimingId, discussingId, escalatingId } = postActions
  const claim = post.claim ?? null
  const isClaimedByMe = claim !== null && claim.claimed_by_id === currentUserId
  const isEscalated = Boolean(post.escalated_at)

  if (activeAction?.postId === post.id && activeAction.type === 'reject') {
    return (
      <div className='mt-4 space-y-3'>
        <Textarea
          aria-label={t('extracted.communities.modQueuePosts.rejectionReason_e5749926')}
          data-pw='mod-queue-rejection-reason'
          value={rejectionReason}
          onChange={event => onRejectionReasonChange(event.target.value)}
          placeholder={t('extracted.communities.modQueuePosts.reasonForRejectionOptional_e546287e')}
          rows={2}
        />
        <div className='flex gap-2'>
          <Button
            size='sm'
            variant='destructive'
            loading={loading === post.id}
            disabled={bulkDisabled || loading === post.id}
            onClick={() => onRejectSubmit(post.id)}
            data-pw='mod-queue-reject-confirm'
          >
            {loading === post.id
              ? t('extracted.communities.modQueuePosts.rejecting_47f29154')
              : t('extracted.communities.modQueuePosts.confirmReject_48426f9f')}
          </Button>
          <Button
            data-pw='mod-queue-posts-cancel'
            size='sm'
            variant='outline'
            disabled={bulkDisabled}
            onClick={onCancelReject}
          >
            {t('extracted.communities.modQueuePosts.cancel_19766ed6')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='mt-4 flex flex-wrap gap-2'>
      <Button
        size='sm'
        loading={loading === post.id}
        disabled={bulkDisabled || loading === post.id}
        onClick={() => onApprove(post.id)}
        data-pw='mod-queue-approve'
      >
        {loading === post.id
          ? t('extracted.communities.modQueuePosts.approving_cee0e61b')
          : t('extracted.communities.modQueuePosts.approve_6007acbe')}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={bulkDisabled || loading === post.id}
        onClick={() => onRejectStart(post.id)}
        data-pw='mod-queue-reject'
      >
        {t('extracted.communities.modQueuePosts.reject_ab604a36')}
      </Button>
      {isClaimedByMe ? (
        <Button
          size='sm'
          variant='outline'
          disabled={claimingId === post.id}
          loading={claimingId === post.id}
          onClick={() => {
            void postActions.handleRelease(post.id)
          }}
          data-pw='release-post-button'
        >
          {t('extracted.communities.modQueuePosts.release_e020e3c6')}
        </Button>
      ) : (
        <Button
          size='sm'
          variant='outline'
          disabled={claimingId === post.id}
          loading={claimingId === post.id}
          onClick={() => {
            void postActions.handleClaim(post.id)
          }}
          data-pw='claim-post-button'
        >
          {t('extracted.communities.modQueuePosts.claim_4ca41db0')}
        </Button>
      )}
      <Button
        size='sm'
        variant='outline'
        disabled={discussingId === post.id}
        loading={discussingId === post.id}
        onClick={() => {
          void postActions.handleDiscuss(post.id)
        }}
        data-pw='discuss-post-button'
      >
        <MessageSquare className='size-4' />
        {t('extracted.communities.modQueuePosts.discuss_3df75fc7')}
      </Button>
      {isEscalated ? (
        <Button
          size='sm'
          variant='outline'
          disabled={escalatingId === post.id}
          loading={escalatingId === post.id}
          onClick={() => {
            void postActions.handleDeEscalate(post.id)
          }}
          data-pw='de-escalate-post-button'
        >
          <AlertTriangle className='size-4' />
          {t('extracted.communities.modQueuePosts.removeEscalation_1ed2ef3d')}
        </Button>
      ) : (
        <Button
          size='sm'
          variant='outline'
          disabled={escalatingId === post.id}
          loading={escalatingId === post.id}
          onClick={() => {
            void postActions.handleEscalate(post.id)
          }}
          data-pw='escalate-post-button'
        >
          <AlertTriangle className='size-4' />
          {t('extracted.communities.modQueuePosts.escalate_d563aaf7')}
        </Button>
      )}
    </div>
  )
}
