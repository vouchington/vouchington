'use client'

import { MessageSquarePlus, RefreshCw, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TimeAgo } from '@/components/shared/time-ago'
import type { ReviewDispute } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DisputeContext } from './dispute-context'

interface DisputeRowProps {
  dispute: ReviewDispute
  disabled: boolean
  onEdit: (id: string, publicResponse: string) => void
  onApprove: (id: string) => void
  onSend: (id: string) => void
  onRerunAI: (id: string) => void
  onResolve: (id: string, action: 'remove' | 'dismiss') => void
  onAnnotate: (id: string, text: string) => void
}

export function DisputeRow({
  dispute,
  disabled,
  onEdit,
  onApprove,
  onSend,
  onRerunAI,
  onResolve,
  onAnnotate,
}: DisputeRowProps) {
  const t = useTranslations()
  const canRerun = !dispute.approved_at && !dispute.sent_at
  const canApprove = dispute.public_response && !dispute.approved_at && !dispute.sent_at
  const canAnnotate = Boolean(dispute.public_response?.trim())
  const canSend = Boolean(dispute.approved_at && !dispute.sent_at)
  const isPending = dispute.status === 'pending'

  return (
    <tr data-pw='dispute-row'>
      <td className='whitespace-nowrap px-4 py-3 text-sm tabular-nums'>
        <TimeAgo date={dispute.created_at} />
      </td>
      <td className='px-4 py-3 text-sm'>
        <DisputeContext dispute={dispute} />
      </td>
      <td className='px-4 py-3 text-sm'>
        <span className='text-xs'>{dispute.reason.replace(/_/g, ' ')}</span>
      </td>
      <td className='px-4 py-3 text-sm'>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {dispute.status}
        </span>
      </td>
      <td className='max-w-xs px-4 py-3 text-sm'>
        {dispute.ai_public_response ? (
          <div className='space-y-1'>
            <p className='text-xs font-medium text-muted-foreground'>
              {t('extracted.disputes.disputeRow.aiRecommendedaction_a89b7966', {
                recommendedAction: dispute.recommended_action,
              })}
            </p>
            <p className='line-clamp-3 text-xs'>{dispute.ai_public_response}</p>
          </div>
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.disputes.disputeRow.noDraftYet_711e568f')}
          </span>
        )}
      </td>
      <td className='max-w-xs px-4 py-3 text-sm'>
        {isPending ? (
          <Textarea
            value={dispute.public_response ?? ''}
            onChange={e => onEdit(dispute.id, e.target.value)}
            placeholder={t('extracted.disputes.disputeRow.editThePublicResponse_3f07d3cb')}
            rows={3}
            className='text-xs'
            disabled={Boolean(dispute.sent_at)}
            data-pw='dispute-public-response'
          />
        ) : (
          <span className='text-xs'>{dispute.public_response ?? '—'}</span>
        )}
      </td>
      <td className='px-4 py-3'>
        {isPending ? (
          <div className='flex flex-wrap gap-1'>
            <Button
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
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.disputes.disputeRow.text_bda05058')}
          </span>
        )}
      </td>
    </tr>
  )
}
