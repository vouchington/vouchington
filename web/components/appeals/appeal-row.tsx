'use client'

import { RefreshCw, Send, X, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TimeAgo } from '@/components/shared/time-ago'
import {
  canResolveModerationAppealAction,
  type ModerationAppeal,
  type ModerationAppealAction,
  type ModerationAppealViewerRole,
} from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'
import { AppealContext } from './appeal-context'

interface AppealRowProps {
  appeal: ModerationAppeal
  viewerRole?: ModerationAppealViewerRole
  disabled: boolean
  onEdit: (id: string, publicResponse: string) => void
  onApprove: (id: string) => void
  onSend: (id: string) => void
  onRerunAI: (id: string) => void
  onResolve: (id: string, action: ModerationAppealAction) => void
}

export function AppealRow({
  appeal,
  viewerRole = 'member',
  disabled,
  onEdit,
  onApprove,
  onSend,
  onRerunAI,
  onResolve,
}: AppealRowProps) {
  const t = useTranslations()
  const isPending = appeal.status === 'pending'
  const canModerate = viewerRole === 'administrator' || viewerRole === 'moderator'
  const canRerun = canModerate && isPending && !appeal.approved_at && !appeal.sent_at
  const canApprove = canModerate && appeal.public_response && !appeal.approved_at && !appeal.sent_at
  const canSend = canModerate && Boolean(appeal.approved_at && !appeal.sent_at)
  const canAccept = canResolveModerationAppealAction(appeal, 'accept', viewerRole)
  const canReduce = canResolveModerationAppealAction(appeal, 'reduce', viewerRole)
  const canDeny = canResolveModerationAppealAction(appeal, 'deny', viewerRole)

  return (
    <tr
      data-pw='appeal-row'
      data-appeal-id={appeal.id}
    >
      <td className='whitespace-nowrap px-4 py-3 text-sm tabular-nums'>
        <TimeAgo date={appeal.created_at} />
        {appeal.is_overdue ? (
          <span className='ml-1 text-xs font-medium text-destructive'>
            {t('extracted.appeals.appealRow.overdue_7038dedb')}
          </span>
        ) : null}
      </td>
      <td className='px-4 py-3 text-sm'>
        <AppealContext appeal={appeal} />
      </td>
      <td className='px-4 py-3 text-sm'>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {appeal.status}
        </span>
      </td>
      <td className='max-w-xs px-4 py-3 text-sm'>
        {appeal.ai_public_response ? (
          <div className='space-y-1'>
            <p className='text-xs font-medium text-muted-foreground'>
              {t('extracted.appeals.appealRow.aiRecommendedaction_a89b7966', {
                recommendedAction: appeal.recommended_action,
              })}
            </p>
            <p className='line-clamp-3 text-xs'>{appeal.ai_public_response}</p>
          </div>
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.appeals.appealRow.noDraftYet_711e568f')}
          </span>
        )}
      </td>
      <td className='max-w-xs px-4 py-3 text-sm'>
        {isPending ? (
          <Textarea
            value={appeal.public_response ?? ''}
            onChange={e => onEdit(appeal.id, e.target.value)}
            placeholder={t('extracted.appeals.appealRow.editThePublicResponse_3f07d3cb')}
            rows={3}
            className='text-xs'
            disabled={disabled || Boolean(appeal.sent_at)}
            data-pw='appeal-public-response'
          />
        ) : (
          <span className='text-xs'>{appeal.public_response ?? '—'}</span>
        )}
      </td>
      <td className='px-4 py-3'>
        {isPending ? (
          <div className='flex flex-wrap gap-1'>
            <Button
              size='touchSm'
              variant='outline'
              disabled={disabled || !canRerun}
              onClick={() => onRerunAI(appeal.id)}
              title={t('extracted.appeals.appealRow.reRunAi_35984122')}
            >
              <RefreshCw className='size-3' />
            </Button>
            <Button
              size='touchSm'
              disabled={disabled || !canApprove}
              onClick={() => onApprove(appeal.id)}
              data-pw='appeal-approve'
            >
              {t('extracted.appeals.appealRow.approve_6007acbe')}
            </Button>
            <Button
              size='touchSm'
              disabled={disabled || !canSend}
              onClick={() => onSend(appeal.id)}
              data-pw='appeal-send'
            >
              <Send className='mr-1 size-3' />
              {t('extracted.appeals.appealRow.send_f6f4688f')}
            </Button>
            <Button
              size='touchSm'
              variant='outline'
              disabled={disabled || !canAccept}
              onClick={() => onResolve(appeal.id, 'accept')}
              data-pw='appeal-accept'
            >
              <CheckCircle className='mr-1 size-3' />
              {t('extracted.appeals.appealRow.accept_89713b9c')}
            </Button>
            <Button
              size='touchSm'
              variant='outline'
              disabled={disabled || !canReduce}
              onClick={() => onResolve(appeal.id, 'reduce')}
              data-pw='appeal-reduce'
            >
              {t('extracted.appeals.appealRow.reduce_42412678')}
            </Button>
            <Button
              size='touchSm'
              variant='outline'
              disabled={disabled || !canDeny}
              onClick={() => onResolve(appeal.id, 'deny')}
              data-pw='appeal-deny'
            >
              <X className='mr-1 size-3' />
              {t('extracted.appeals.appealRow.deny_05a2d733')}
            </Button>
          </div>
        ) : (
          <span className='text-xs text-muted-foreground'>{appeal.resolution_action ?? '—'}</span>
        )}
      </td>
    </tr>
  )
}
