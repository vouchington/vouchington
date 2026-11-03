'use client'

import { MessageSquarePlus, RefreshCw, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PostContentText } from '@/components/posts/post-content-text'
import type { ReviewDispute } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'

export interface DisputeDetailActions {
  disabled: boolean
  onEdit: (id: string, publicResponse: string) => void
  onApprove: (id: string) => void
  onSend: (id: string) => void
  onRerunAI: (id: string) => void
  onResolve: (id: string, action: 'remove' | 'dismiss') => void
  onAnnotate: (id: string, text: string) => void
}

/** The claim and review context that the list row leaves out. */
function DisputeClaim({ dispute }: { dispute: ReviewDispute }) {
  const review = dispute.staff_context?.review
  return (
    <div className='space-y-1 text-xs'>
      {review?.post.markdown_preview ? (
        <PostContentText
          as='p'
          className='line-clamp-2 text-muted-foreground'
          content={{
            text: review.post.markdown_preview,
            declared_language: review.post.declared_language,
            lingua_rs_detected_language: review.post.lingua_rs_detected_language,
          }}
        />
      ) : null}
      {review?.topic ? <p className='text-muted-foreground'>{review.topic.name}</p> : null}
      {review?.rating !== null && review?.rating !== undefined ? (
        <p className='text-muted-foreground'>{review.rating}/5</p>
      ) : null}
      {dispute.claim_text ? <p className='text-muted-foreground'>{dispute.claim_text}</p> : null}
    </div>
  )
}

export function DisputeDetail({
  dispute,
  disabled,
  onEdit,
  onApprove,
  onSend,
  onRerunAI,
  onResolve,
  onAnnotate,
}: { dispute: ReviewDispute } & DisputeDetailActions) {
  const t = useTranslations()
  const canRerun = !dispute.approved_at && !dispute.sent_at
  const canApprove = dispute.public_response && !dispute.approved_at && !dispute.sent_at
  const canAnnotate = Boolean(dispute.public_response?.trim())
  const canSend = Boolean(dispute.approved_at && !dispute.sent_at)
  const isPending = dispute.status === 'pending'

  return (
    <div
      className='space-y-4'
      data-pw='dispute-detail'
    >
      <DisputeClaim dispute={dispute} />
      {dispute.ai_public_response ? (
        <div className='space-y-1'>
          <p className='text-xs font-medium text-muted-foreground'>
            {t('extracted.disputes.disputeRow.aiRecommendedaction_a89b7966', {
              recommendedAction: dispute.recommended_action,
            })}
          </p>
          <p className='text-xs'>{dispute.ai_public_response}</p>
        </div>
      ) : (
        <span className='text-xs text-muted-foreground'>
          {t('extracted.disputes.disputeRow.noDraftYet_711e568f')}
        </span>
      )}
      {isPending ? (
        <>
          <Textarea
            value={dispute.public_response ?? ''}
            onChange={e => onEdit(dispute.id, e.target.value)}
            placeholder={t('extracted.disputes.disputeRow.editThePublicResponse_3f07d3cb')}
            rows={5}
            className='text-xs'
            disabled={Boolean(dispute.sent_at)}
            data-pw='dispute-public-response'
          />
          <div className='flex flex-wrap gap-1'>
            <Button
              data-pw='dispute-row-re-run-ai'
              size='touchSm'
              variant='outline'
              disabled={disabled || !canRerun}
              onClick={() => onRerunAI(dispute.id)}
              title={t('extracted.disputes.disputeRow.reRunAi_35984122')}
            >
              <RefreshCw className='size-3' />
            </Button>
            <Button
              size='touchSm'
              disabled={disabled || !canApprove}
              onClick={() => onApprove(dispute.id)}
              data-pw='dispute-approve'
            >
              {t('extracted.disputes.disputeRow.approve_6007acbe')}
            </Button>
            <Button
              size='touchSm'
              disabled={disabled || !canSend}
              onClick={() => onSend(dispute.id)}
              data-pw='dispute-send'
            >
              <Send className='mr-1 size-3' />
              {t('extracted.disputes.disputeRow.send_f6f4688f')}
            </Button>
            <Button
              size='touchSm'
              variant='outline'
              disabled={disabled || !canAnnotate}
              onClick={() => onAnnotate(dispute.id, dispute.public_response ?? '')}
              title={t('extracted.disputes.disputeRow.attachTheResponseAboveAsA_73264af0')}
              data-pw='dispute-annotate'
            >
              <MessageSquarePlus className='mr-1 size-3' />
              {t('extracted.disputes.disputeRow.annotate_205fc388')}
            </Button>
            <Button
              size='touchSm'
              variant='destructive'
              disabled={disabled}
              onClick={() => onResolve(dispute.id, 'remove')}
              data-pw='dispute-remove'
            >
              {t('extracted.disputes.disputeRow.remove_c3812fc4')}
            </Button>
            <Button
              size='touchSm'
              variant='outline'
              disabled={disabled}
              onClick={() => onResolve(dispute.id, 'dismiss')}
              data-pw='dispute-dismiss'
            >
              <X className='mr-1 size-3' />
              {t('extracted.disputes.disputeRow.dismiss_48845bff')}
            </Button>
          </div>
        </>
      ) : (
        <p className='text-xs'>{dispute.public_response ?? '—'}</p>
      )}
    </div>
  )
}
