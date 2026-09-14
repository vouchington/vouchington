'use client'

import Link from 'next/link'
import { Check, RefreshCw, X } from 'lucide-react'
import { TooltipButton } from '@/components/ui/_button-tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getAdminReviewQueuePostHref } from '@/lib/admin-review-queue'
import type { AdminReviewQueuePost } from '@/types/admin-review-queue'
import { ModerationSlaBadge } from '@/components/moderation/moderation-queue-badges'
import { ClearanceBadge, ModerationSummary, PostTypeBadge } from './review-queue-helpers'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ReviewQueueMedia } from './review-queue-media'
import { PostContentText } from '@/components/posts/post-content-text'

interface Props {
  posts: AdminReviewQueuePost[]
  actionPostId: string | null
  onUpdate: (post: AdminReviewQueuePost, status: 'approved' | 'rejected' | 'in_review') => void
  onReveal: (postId: string) => void
  revealDisabled: boolean
}

export function ReviewQueueTable({
  posts,
  actionPostId,
  onUpdate,
  onReveal,
  revealDisabled,
}: Props) {
  const t = useTranslations()
  return (
    <div className='overflow-hidden rounded-lg bg-card shadow-sm dark:shadow-none'>
      <Table>
        <TableHeader className='bg-muted/50'>
          <TableRow>
            <TableHead>{t('extracted.reviewQueue.reviewQueueTable.post_a5554622')}</TableHead>
            <TableHead>{t('extracted.reviewQueue.reviewQueueTable.status_920e413c')}</TableHead>
            <TableHead>{t('extracted.reviewQueue.reviewQueueTable.signals_88b01c8a')}</TableHead>
            <TableHead className='w-28 text-right'>
              {t('extracted.reviewQueue.reviewQueueTable.actions_ff8059dc')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className='py-10 text-center text-muted-foreground'
              >
                {t('extracted.reviewQueue.reviewQueueTable.noPostsNeedReview_201c754b')}
              </TableCell>
            </TableRow>
          ) : (
            posts.map(post => (
              <TableRow key={post.id}>
                <TableCell className='max-w-xl'>
                  <PostContentText
                    as={Link}
                    content={{
                      text: post.title,
                      declared_language: post.declared_language,
                      lingua_rs_detected_language: post.lingua_rs_detected_language,
                    }}
                    fallback={t('extracted.reviewQueue.reviewQueueTable.untitledPost_4d5e6f71')}
                    href={getAdminReviewQueuePostHref(post)}
                    className='font-medium text-foreground hover:underline'
                    prefetch={false}
                    data-pw='review-queue-post-title'
                  />
                  <PostContentText
                    as='div'
                    content={{
                      text: post.markdown_preview,
                      declared_language: post.declared_language,
                      lingua_rs_detected_language: post.lingua_rs_detected_language,
                    }}
                    fallback={t(
                      'extracted.reviewQueue.reviewQueueTable.noPreviewAvailable_5e6f7082',
                    )}
                    className='mt-1 line-clamp-2 text-sm text-muted-foreground'
                  />
                  <ReviewQueueMedia
                    postId={post.id}
                    mediaReveal={post.media_reveal}
                    onReveal={onReveal}
                    revealDisabled={revealDisabled}
                  />
                  <div className='mt-2 flex items-center gap-2'>
                    <PostTypeBadge postType={post.post_type} />
                    <ModerationSlaBadge createdAt={post.created_at} />
                    <span className='text-xs text-muted-foreground'>{post.id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <ClearanceBadge status={post.clearance_status} />
                </TableCell>
                <TableCell>
                  <ModerationSummary summary={post.moderation_summary} />
                </TableCell>
                <TableCell>
                  <div className='flex justify-end gap-2'>
                    <TooltipButton
                      tooltip={t('extracted.reviewQueue.reviewQueueTable.approve_6007acbe')}
                      variant='outline'
                      size='icon'
                      aria-label={t(
                        'extracted.reviewQueue.reviewQueueTable.approvePostlabel_98391264',
                        {
                          postLabel: post.title || post.id,
                        },
                      )}
                      data-pw='review-queue-approve'
                      disabled={actionPostId === post.id}
                      onClick={() => onUpdate(post, 'approved')}
                    >
                      <Check className='h-4 w-4' />
                    </TooltipButton>
                    <TooltipButton
                      tooltip={t('extracted.reviewQueue.reviewQueueTable.reject_ab604a36')}
                      variant='outline'
                      size='icon'
                      aria-label={t(
                        'extracted.reviewQueue.reviewQueueTable.rejectPostlabel_2a193ad2',
                        {
                          postLabel: post.title || post.id,
                        },
                      )}
                      data-pw='review-queue-reject'
                      disabled={actionPostId === post.id}
                      onClick={() => onUpdate(post, 'rejected')}
                    >
                      <X className='h-4 w-4' />
                    </TooltipButton>
                    <TooltipButton
                      tooltip={t('extracted.reviewQueue.reviewQueueTable.markForReReview_e39e1236')}
                      variant='outline'
                      size='icon'
                      aria-label={t(
                        'extracted.reviewQueue.reviewQueueTable.markForReReviewPostlabel_55c7a8c3',
                        { postLabel: post.title || post.id },
                      )}
                      data-pw='mark-for-review'
                      disabled={actionPostId === post.id || post.clearance_status === 'in_review'}
                      onClick={() => onUpdate(post, 'in_review')}
                    >
                      <RefreshCw className='h-4 w-4' />
                    </TooltipButton>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
