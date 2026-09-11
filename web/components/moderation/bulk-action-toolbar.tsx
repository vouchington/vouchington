'use client'

import { Ban, Check, ShieldAlert, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'

export type ModerationBulkAction = 'dismiss' | 'remove'

interface BulkActionToolbarProps {
  action: ModerationBulkAction | null
  canRemove?: boolean
  disabled?: boolean
  message?: string | null
  removeReason: string
  selectedCount: number
  showRemoveReason?: boolean
  onActionChange: (action: ModerationBulkAction | null) => void
  onClearSelection: () => void
  onConfirm: (action: ModerationBulkAction) => void
  onRemoveReasonChange?: (value: string) => void
}

export function BulkActionToolbar({
  action,
  canRemove = true,
  disabled = false,
  message,
  removeReason,
  selectedCount,
  showRemoveReason = false,
  onActionChange,
  onClearSelection,
  onConfirm,
  onRemoveReasonChange,
}: BulkActionToolbarProps) {
  const t = useTranslations()
  if (selectedCount === 0) return null

  return (
    <div className='rounded-md border bg-card p-3 shadow-sm'>
      <div className='flex flex-wrap items-center gap-2'>
        <p
          className='mr-auto text-sm font-medium'
          data-pw='moderation-selected-count'
        >
          {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
        </p>
        <Button
          size='sm'
          variant='outline'
          data-pw='bulk-dismiss-button'
          disabled={disabled}
          onClick={() => onActionChange('dismiss')}
        >
          <Check className='size-4' />
          {t('extracted.moderation.bulkActionToolbar.dismiss_48845bff')}
        </Button>
        <Button
          size='sm'
          variant='destructive'
          data-pw='bulk-remove-button'
          disabled={disabled || !canRemove}
          title={
            canRemove
              ? undefined
              : t(
                  'extracted.moderation.bulkActionToolbar.onlyAdministratorsCanBulkRemoveReported_56c7021e',
                )
          }
          onClick={() => onActionChange('remove')}
        >
          <Trash2 className='size-4' />
          {t('extracted.moderation.bulkActionToolbar.remove_c3812fc4')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled
          title={t('extracted.moderation.bulkActionToolbar.bulkUserBansDependOnThe_4adf2910')}
        >
          <Ban className='size-4' />
          {t('extracted.moderation.bulkActionToolbar.banUser_29b589a6')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled
          title={t(
            'extracted.moderation.bulkActionToolbar.bulkEscalationDependsOnClaimAssign_8382896a',
          )}
        >
          <ShieldAlert className='size-4' />
          {t('extracted.moderation.bulkActionToolbar.escalate_d563aaf7')}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={disabled}
          onClick={onClearSelection}
        >
          <X className='size-4' />
          {t('extracted.moderation.bulkActionToolbar.clear_83b12c22')}
        </Button>
      </div>
      {message ? <p className='mt-2 text-sm text-muted-foreground'>{message}</p> : null}
      {action ? (
        <div className='mt-3 space-y-3 rounded-md border bg-muted/30 p-3'>
          <p className='text-sm'>
            Confirm {action === 'dismiss' ? 'dismissal' : 'removal'} for {selectedCount} selected
            item{selectedCount === 1 ? '' : 's'}.
          </p>
          {action === 'remove' && showRemoveReason ? (
            <Textarea
              aria-label={t('extracted.moderation.bulkActionToolbar.bulkRemovalReason_63dd0b05')}
              value={removeReason}
              onChange={event => onRemoveReasonChange?.(event.target.value)}
              placeholder={t(
                'extracted.moderation.bulkActionToolbar.reasonForRemovalOptional_5b4429e6',
              )}
              rows={2}
            />
          ) : null}
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              variant={action === 'remove' ? 'destructive' : 'default'}
              disabled={disabled}
              onClick={() => onConfirm(action)}
            >
              {t('extracted.moderation.bulkActionToolbar.confirm_eebdd24a')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={disabled}
              onClick={() => onActionChange(null)}
            >
              {t('extracted.moderation.bulkActionToolbar.cancel_19766ed6')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
