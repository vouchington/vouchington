/* oxlint-disable max-lines, jsx-a11y/no-noninteractive-tabindex -- claim/escalate/discuss controls grew the file beyond 200 lines; focusable cards support moderation queue navigation while nested buttons keep native behavior. */
'use client'

import { startTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  claimCommunityPendingPost,
  deEscalateCommunityPendingPost,
  escalateCommunityPendingPost,
  openModInternalThreadForPost,
  releaseCommunityPendingPost,
} from '@/lib/api/client/mod-queue-actions'
import { messagesHref } from '@/lib/links/entity-href'
import onError from '@/lib/on-error'
import type { CommunityPostsResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import { PostContentText } from '@/components/posts/post-content-text'

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
  const router = useRouter()
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [escalatingId, setEscalatingId] = useState<string | null>(null)
  const [discussingId, setDiscussingId] = useState<string | null>(null)

  async function handleDiscuss(postId: string) {
    if (discussingId === postId) return
    setDiscussingId(postId)
    try {
      const { conversation } = await openModInternalThreadForPost(communitySlug, postId)
      router.push(messagesHref(conversation))
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.modQueuePosts.failedToOpenInternalDiscussionThread_3243e335',
        ),
        tags: { action: 'mod-internal-thread-post', communitySlug },
      })
    } finally {
      setDiscussingId(null)
    }
  }

  async function handleClaim(postId: string) {
    if (claimingId === postId) return
    setClaimingId(postId)
    try {
      await claimCommunityPendingPost(communitySlug, postId)
      onClaimToggle?.(postId)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueuePosts.failedToClaimPost_f3c642ce'),
        tags: { action: 'claim-post', communitySlug },
      })
    } finally {
      setClaimingId(null)
    }
  }

  async function handleRelease(postId: string) {
    if (claimingId === postId) return
    setClaimingId(postId)
    try {
      await releaseCommunityPendingPost(communitySlug, postId)
      onClaimToggle?.(postId)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueuePosts.failedToReleasePostClaim_7e3c06c4'),
        tags: { action: 'release-post', communitySlug },
      })
    } finally {
      setClaimingId(null)
    }
  }

  async function handleEscalate(postId: string) {
    if (escalatingId === postId) return
    setEscalatingId(postId)
    try {
      await escalateCommunityPendingPost(communitySlug, postId)
      onEscalateToggle?.(postId, true)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueuePosts.failedToEscalatePost_e4397974'),
        tags: { action: 'escalate-post', communitySlug },
      })
    } finally {
      setEscalatingId(null)
    }
  }

  async function handleDeEscalate(postId: string) {
    if (escalatingId === postId) return
    setEscalatingId(postId)
    try {
      await deEscalateCommunityPendingPost(communitySlug, postId)
      onEscalateToggle?.(postId, false)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueuePosts.failedToRemovePostEscalation_98077301'),
        tags: { action: 'de-escalate-post', communitySlug },
      })
    } finally {
      setEscalatingId(null)
    }
  }

  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-semibold uppercase text-muted-foreground'>
        {t('extracted.communities.modQueuePosts.pendingPosts_816ee56f')}
      </h3>
      <div className='space-y-4'>
        {posts.map(post => {
          const queueKey = `post:${post.id}`
          const active = activeKey === queueKey
          const claim = post.claim ?? null
          const isClaimedByMe = claim !== null && claim.claimed_by_id === currentUserId
          const isClaimedByOther = claim !== null && claim.claimed_by_id !== currentUserId
          const isEscalated = Boolean(post.escalated_at)
          return (
            <div
              key={post.id}
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
                  aria-label={t(
                    'extracted.communities.modQueuePosts.selectPendingPostPosttitle_0d498548',
                    { postTitle: post.title },
                  )}
                  checked={selectedIds.has(post.id)}
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

              {activeAction?.postId === post.id && activeAction.type === 'reject' ? (
                <div className='mt-4 space-y-3'>
                  <Textarea
                    aria-label={t('extracted.communities.modQueuePosts.rejectionReason_e5749926')}
                    data-pw='mod-queue-rejection-reason'
                    value={rejectionReason}
                    onChange={e => onRejectionReasonChange(e.target.value)}
                    placeholder={t(
                      'extracted.communities.modQueuePosts.reasonForRejectionOptional_e546287e',
                    )}
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
                      size='sm'
                      variant='outline'
                      disabled={bulkDisabled}
                      onClick={onCancelReject}
                    >
                      {t('extracted.communities.modQueuePosts.cancel_19766ed6')}
                    </Button>
                  </div>
                </div>
              ) : (
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
                        handleRelease(post.id).catch(() => {})
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
                        handleClaim(post.id).catch(() => {})
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
                      handleDiscuss(post.id).catch(() => {})
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
                        handleDeEscalate(post.id).catch(() => {})
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
                        handleEscalate(post.id).catch(() => {})
                      }}
                      data-pw='escalate-post-button'
                    >
                      <AlertTriangle className='size-4' />
                      {t('extracted.communities.modQueuePosts.escalate_d563aaf7')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
