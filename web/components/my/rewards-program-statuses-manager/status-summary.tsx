'use client'

import { Button } from '@/components/ui/button'
import type { RewardsProgramStatus } from '@/types/my'
import { useTranslations } from '@/lib/i18n/use-translations'

interface StatusSummaryProps {
  confirmingDeleteId: string | null
  loading: boolean
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onStartDelete: () => void
  onStartEdit: () => void
  status: RewardsProgramStatus
}

export function StatusSummary({
  confirmingDeleteId,
  loading,
  onCancelDelete,
  onConfirmDelete,
  onStartDelete,
  onStartEdit,
  status,
}: StatusSummaryProps) {
  const t = useTranslations()
  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
      <div>
        <p
          className='font-medium'
          data-pw='rewards-status-name'
        >
          {status.rewards_program_status.name}
        </p>
        <div className='flex flex-wrap gap-3 text-xs text-muted-foreground'>
          {status.since && (
            <span>
              {t('extracted.rewardsProgramStatusesManager.statusSummary.sinceDate_4a6fc195', {
                date: status.since,
              })}
            </span>
          )}
          {status.until && (
            <span>
              {t('extracted.rewardsProgramStatusesManager.statusSummary.untilDate_0bce791c', {
                date: status.until,
              })}
            </span>
          )}
        </div>
      </div>
      <div className='flex gap-2'>
        {confirmingDeleteId === status.id ? (
          <>
            <span className='self-center text-sm text-destructive'>
              {t('extracted.rewardsProgramStatusesManager.statusSummary.remove_9fe2f243')}
            </span>
            <Button
              size='sm'
              variant='destructive'
              onClick={onConfirmDelete}
              disabled={loading}
            >
              {t('extracted.rewardsProgramStatusesManager.statusSummary.confirm_eebdd24a')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={onCancelDelete}
            >
              {t('extracted.rewardsProgramStatusesManager.statusSummary.cancel_19766ed6')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size='sm'
              variant='outline'
              onClick={onStartEdit}
              disabled={loading}
              data-pw='rewards-status-edit-button'
            >
              {t('extracted.rewardsProgramStatusesManager.statusSummary.edit_464c4ffd')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={onStartDelete}
              disabled={loading}
            >
              {t('extracted.rewardsProgramStatusesManager.statusSummary.remove_c3812fc4')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
