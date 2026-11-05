/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- focusable cards support moderation queue navigation while nested buttons keep native behavior. */
'use client'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { PostContentText } from '@/components/posts/post-content-text'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CommunityPostsResponseBody } from '@/types/api-responses'
import { ModQueuePostCardActions } from './mod-queue-post-card-actions'
import type { ModQueuePostActions } from './use-mod-queue-post-actions'

type PendingPost = CommunityPostsResponseBody['posts'][string]

export function ModQueuePostCard({
  activeAction,
  activeKey,
  bulkDisabled,
  currentUserId,
  loading,
  onActiveChange,
  onApprove,
  onCancelReject,
  onRejectStart,
  onRejectSubmit,
  onRejectionReasonChange,
  onSelectionToggle,
  post,
  postActions,
  rejectionReason,
  selected,
}: {
  activeAction: { postId: string; type: 'reject' } | null
  activeKey: string | null
  bulkDisabled: boolean
  currentUserId: string | null
  loading: string | null
  onActiveChange: (key: string) => void
  onApprove: (postId: string) => void
  onCancelReject: () => void
  onRejectStart: (postId: string) => void
  onRejectSubmit: (postId: string) => void
  onRejectionReasonChange: (value: string) => void
  onSelectionToggle: (postId: string) => void
  post: PendingPost
  postActions: ModQueuePostActions
  rejectionReason: string
  selected: boolean
}) {
  const t = useTranslations()
  const queueKey = `post:${post.id}`
  const active = activeKey === queueKey
  const claim = post.claim ?? null
  const isClaimedByMe = claim !== null && claim.claimed_by_id === currentUserId
  const isClaimedByOther = claim !== null && claim.claimed_by_id !== currentUserId
  const isEscalated = Boolean(post.escalated_at)

  return (
    <div
      className={cn(
        'rounded-md border bg-card p-4 outline-none transition-colors',
        active && 'ring-2 ring-ring ring-offset-2',
      )}
      data-pw='mod-queue-post-card'
      data-post-id={post.id}
      data-moderation-queue-key={queueKey}
      data-active={active}
      tabIndex={0}
      onFocus={() => onActiveChange(queueKey)}
    >
      <div className='flex gap-3'>
        <Checkbox
          aria-label={t('extracted.communities.modQueuePosts.selectPendingPostPosttitle_0d498548', {
            postTitle: post.title,
          })}
          checked={selected}
          disabled={bulkDisabled}
          onCheckedChange={() => onSelectionToggle(post.id)}
        />
        <div className='flex flex-col gap-1'>
          <PostContentText
            as='h3'
            className='font-semibold'
            data-pw='mod-queue-post-title'
            content={{
              text: post.title,
              declared_language: post.declared_language,
              lingua_rs_detected_language: post.lingua_rs_detected_language,
            }}
          />
          <div className='flex flex-wrap gap-2'>
            {isEscalated && (
              <Badge
                variant='destructive'
                data-pw='post-escalated-badge'
              >
                {t('extracted.communities.modQueuePosts.escalated_b710aaaa')}
              </Badge>
            )}
            {isClaimedByMe && (
              <Badge
                variant='outline'
                data-pw='post-claimed-by-me-badge'
              >
                {t('extracted.communities.modQueuePosts.claimedByYou_c0a65290')}
              </Badge>
            )}
            {isClaimedByOther && (
              <Badge
                variant='secondary'
                data-pw='post-claimed-by-other-badge'
              >
                {t('extracted.communities.modQueuePosts.claimed_ddcd2779')}
              </Badge>
            )}
          </div>
        </div>
      </div>
      {post.markdown && (
        <PostContentText
          as='p'
          className='mt-1 line-clamp-3 text-sm text-muted-foreground'
          content={{
            text: post.markdown,
            declared_language: post.declared_language,
            lingua_rs_detected_language: post.lingua_rs_detected_language,
          }}
        />
      )}
      <p
        className='mt-2 text-xs text-muted-foreground'
        suppressHydrationWarning
      >
        {t('extracted.communities.modQueuePosts.submitted_64900440')}{' '}
        {new Date(post.created_at).toLocaleDateString()}
      </p>
      <ModQueuePostCardActions
        activeAction={activeAction}
        bulkDisabled={bulkDisabled}
        currentUserId={currentUserId}
        loading={loading}
        onApprove={onApprove}
        onCancelReject={onCancelReject}
        onRejectStart={onRejectStart}
        onRejectSubmit={onRejectSubmit}
        onRejectionReasonChange={onRejectionReasonChange}
        post={post}
        postActions={postActions}
        rejectionReason={rejectionReason}
      />
    </div>
  )
}
