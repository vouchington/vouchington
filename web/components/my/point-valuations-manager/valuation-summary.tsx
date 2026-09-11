'use client'

import { Button } from '@/components/ui/button'
import type { PointValuation } from '@/types/my'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatScaledMoney } from '@/lib/money'

interface ValuationSummaryProps {
  confirmingDeleteId: string | null
  loading: boolean
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onStartDelete: () => void
  onStartEdit: () => void
  valuation: PointValuation
}

export function ValuationSummary({
  confirmingDeleteId,
  loading,
  onCancelDelete,
  onConfirmDelete,
  onStartDelete,
  onStartEdit,
  valuation,
}: ValuationSummaryProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
      <div>
        <p
          className='font-medium'
          data-pw='point-valuation-program-name'
        >
          {valuation.rewards_program.name}
        </p>
        <p
          className='text-sm text-muted-foreground'
          data-pw='point-valuation-cpp-display'
        >
          {t('extracted.pointValuationsManager.valuationSummary.valuePerPoint_7111fb3c', {
            value: formatScaledMoney(valuation.value_per_point, uiLocale),
          })}
        </p>
        {valuation.note && <p className='mt-1 text-sm text-muted-foreground'>{valuation.note}</p>}
      </div>
      <div className='flex gap-2'>
        {confirmingDeleteId === valuation.id ? (
          <>
            <span className='self-center text-sm text-destructive'>
              {t('extracted.pointValuationsManager.valuationSummary.remove_9fe2f243')}
            </span>
            <Button
              size='sm'
              variant='destructive'
              onClick={onConfirmDelete}
              disabled={loading}
            >
              {t('extracted.pointValuationsManager.valuationSummary.confirm_eebdd24a')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={onCancelDelete}
            >
              {t('extracted.pointValuationsManager.valuationSummary.cancel_19766ed6')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size='sm'
              variant='outline'
              onClick={onStartEdit}
              disabled={loading}
              data-pw='point-valuation-edit-button'
            >
              {t('extracted.pointValuationsManager.valuationSummary.edit_464c4ffd')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={onStartDelete}
              disabled={loading}
            >
              {t('extracted.pointValuationsManager.valuationSummary.remove_c3812fc4')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
