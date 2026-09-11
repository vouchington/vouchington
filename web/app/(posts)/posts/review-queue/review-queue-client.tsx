'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { markPostForReview, updateAdminReviewQueuePost } from '@/lib/api/client'
import { ExposureCooldownGate } from '@/components/moderation/exposure-cooldown-gate'
import { useExposureCooldown } from '@/components/moderation/use-exposure-cooldown'
import type { AdminReviewQueuePost, AdminReviewQueueResponse } from '@/types/admin-review-queue'
import { ReviewQueueHeader } from './review-queue-header'
import { ReviewQueueTable } from './review-queue-table'

export function AdminReviewQueueClient({ initialData }: { initialData: AdminReviewQueueResponse }) {
  const { refresh } = useRouter()
  const [isPending, startTransition] = useTransition()
  const cooldown = useExposureCooldown()
  const [posts, setPosts] = useState(initialData.results)
  const [actionPostId, setActionPostId] = useState<string | null>(null)
  useEffect(() => {
    queueMicrotask(() => setPosts(initialData.results))
  }, [initialData.results])

  const reviewCount = posts.length
  const flaggedCount = posts.filter(
    post => post.spam_detection_flagged === true || post.openai_omni_moderation_flagged === true,
  ).length

  async function updatePost(
    post: AdminReviewQueuePost,
    status: 'approved' | 'rejected' | 'in_review',
  ) {
    setActionPostId(post.id)
    try {
      if (status === 'in_review') {
        const response = await markPostForReview(post.id)
        setPosts(current =>
          current.map(item =>
            item.id === post.id
              ? {
                  ...item,
                  clearance_status:
                    response.clearance_status as AdminReviewQueuePost['clearance_status'],
                }
              : item,
          ),
        )
        toast.success('Post marked for re-review')
      } else {
        const response = await updateAdminReviewQueuePost(post.id, status)
        setPosts(current =>
          status === 'approved'
            ? current.filter(item => item.id !== post.id)
            : current.map(item => (item.id === post.id ? { ...item, ...response.post } : item)),
        )
        toast.success(status === 'approved' ? 'Post approved' : 'Post rejected')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update post')
    } finally {
      setActionPostId(null)
    }
  }

  return (
    <ExposureCooldownGate cooldown={cooldown}>
      <div>
        <ReviewQueueHeader
          reviewCount={reviewCount}
          flaggedCount={flaggedCount}
          isPending={isPending}
          onRefresh={() => {
            void cooldown.refreshExposureState()
            startTransition(() => {
              refresh()
            })
          }}
        />
        <ReviewQueueTable
          posts={posts}
          actionPostId={actionPostId}
          onUpdate={updatePost}
          onReveal={postId => cooldown.recordReveal({ postId, surface: 'review_queue' })}
          revealDisabled={cooldown.revealBlocked}
        />
      </div>
    </ExposureCooldownGate>
  )
}
