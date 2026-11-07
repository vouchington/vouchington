'use client'

import { useTranslations } from '@/lib/i18n/use-translations'
import type { CommunityPostsResponseBody } from '@/types/api-responses'
import { ModQueuePostCard } from './mod-queue-post-card'
import { useModQueuePostActions } from './use-mod-queue-post-actions'

type PendingPost = CommunityPostsResponseBody['posts'][string]

interface PostAction {
  postId: string
  type: 'reject'
}

interface ModQueuePostsProps {
  activeAction: PostAction | null
  activeKey: string | null
  bulkDisabled?: boolean
  communitySlug: string
  currentUserId?: string | null
  loading: string | null
  onActiveChange: (key: string) => void
  onApprove: (postId: string) => void
  onCancelReject: () => void
  onClaimToggle?: (postId: string) => void
  onEscalateToggle?: (postId: string, escalated: boolean) => void
  onRejectStart: (postId: string) => void
  onRejectSubmit: (postId: string) => void
  onRejectionReasonChange: (value: string) => void
  onSelectionToggle: (postId: string) => void
  posts: PendingPost[]
  rejectionReason: string
  selectedIds: ReadonlySet<string>
}

export function ModQueuePosts({
  activeAction,
  activeKey,
  bulkDisabled = false,
  communitySlug,
  currentUserId = null,
  loading,
  onActiveChange,
  onApprove,
  onCancelReject,
  onClaimToggle,
  onEscalateToggle,
  onRejectStart,
  onRejectSubmit,
  onRejectionReasonChange,
  onSelectionToggle,
  posts,
  rejectionReason,
  selectedIds,
}: ModQueuePostsProps) {
  const t = useTranslations()
  const postActions = useModQueuePostActions({
    communitySlug,
    onClaimToggle,
    onEscalateToggle,
  })

  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
        {t('extracted.communities.modQueuePosts.pendingPosts_816ee56f')}
      </h3>
      <div className='space-y-4'>
        {posts.map(post => (
          <ModQueuePostCard
            key={post.id}
            activeAction={activeAction}
            activeKey={activeKey}
            bulkDisabled={bulkDisabled}
            currentUserId={currentUserId}
            loading={loading}
            onActiveChange={onActiveChange}
            onApprove={onApprove}
            onCancelReject={onCancelReject}
            onRejectStart={onRejectStart}
            onRejectSubmit={onRejectSubmit}
            onRejectionReasonChange={onRejectionReasonChange}
            onSelectionToggle={onSelectionToggle}
            post={post}
            postActions={postActions}
            rejectionReason={rejectionReason}
            selected={selectedIds.has(post.id)}
          />
        ))}
      </div>
    </section>
  )
}
