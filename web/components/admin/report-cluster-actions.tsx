'use client'

import { Check, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ReportClusterActions({
  disabled,
  loadingAction,
  canRemoveTarget,
  hasPendingReports,
  isPartialReportSet,
  onDismiss,
  onRemoveTarget,
  onReview,
}: {
  disabled: boolean
  loadingAction: 'dismiss' | 'remove' | 'review' | null
  canRemoveTarget: boolean
  hasPendingReports: boolean
  isPartialReportSet: boolean
  onDismiss: () => void
  onRemoveTarget: () => void
  onReview: () => void
}) {
  const t = useTranslations()
  if (!hasPendingReports) return null
  return (
    <div className='flex flex-wrap gap-2'>
      <Button
        size='touchSm'
        disabled={disabled}
        onClick={onReview}
      >
        {loadingAction === 'review' ? (
          <RefreshCw className='size-4 animate-spin' />
        ) : (
          <Check className='size-4' />
        )}
        {isPartialReportSet
          ? t('extracted.admin.reportClusterActions.reviewLoaded_0038d8d1')
          : t('extracted.admin.reportClusterActions.reviewAll_d05163fa')}
      </Button>
      <Button
        size='touchSm'
        variant='outline'
        disabled={disabled}
        onClick={onDismiss}
      >
        {loadingAction === 'dismiss' ? (
          <RefreshCw className='size-4 animate-spin' />
        ) : (
          <X className='size-4' />
        )}
        {isPartialReportSet
          ? t('extracted.admin.reportClusterActions.dismissLoaded_c207068e')
          : t('extracted.admin.reportClusterActions.dismissAll_97fac9e5')}
      </Button>
      {canRemoveTarget ? (
        <Button
          size='touchSm'
          variant='destructive'
          disabled={disabled}
          onClick={onRemoveTarget}
        >
          {loadingAction === 'remove' ? (
            <RefreshCw className='size-4 animate-spin' />
          ) : (
            <Trash2 className='size-4' />
          )}
          {t('extracted.admin.reportClusterActions.removeTarget_efdbbceb')}
        </Button>
      ) : null}
    </div>
  )
}
