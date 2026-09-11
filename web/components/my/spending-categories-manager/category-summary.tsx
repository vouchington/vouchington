'use client'

import { Button } from '@/components/ui/button'
import type { SpendingCategory } from '@/types/my'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatMoney } from '@/lib/money'

interface CategorySummaryProps {
  category: SpendingCategory
  confirmingDeleteId: string | null
  loading: boolean
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onStartDelete: () => void
  onStartEdit: () => void
}

export function CategorySummary({
  category,
  confirmingDeleteId,
  loading,
  onCancelDelete,
  onConfirmDelete,
  onStartDelete,
  onStartEdit,
}: CategorySummaryProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const frequency =
    category.spending_frequency === 'monthly'
      ? t('extracted.spendingCategoriesManager.frequencySelect.monthly_9b11f6b7')
      : t('extracted.spendingCategoriesManager.frequencySelect.annually_1ec9d1d5')
  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
      <div>
        <p
          className='font-medium'
          data-pw='spending-category-name'
        >
          {category.spending_category.name}
        </p>
        <p
          className='text-sm text-muted-foreground'
          data-pw='spending-category-amount'
        >
          {formatMoney(category.amount, uiLocale)} / {frequency}
        </p>
        {category.note && <p className='mt-1 text-sm text-muted-foreground'>{category.note}</p>}
        {category.owner_type === 'household' && category.can_manage === false && (
          <p
            className='mt-1 text-sm text-muted-foreground'
            data-pw='spending-category-read-only'
          >
            {t('extracted.spendingCategoriesManager.categorySummary.householdReadOnly_7898')}
          </p>
        )}
      </div>
      {category.can_manage !== false && (
        <div className='flex gap-2'>
          {confirmingDeleteId === category.id ? (
            <>
              <span className='self-center text-sm text-destructive'>
                {t('extracted.spendingCategoriesManager.categorySummary.remove_9fe2f243')}
              </span>
              <Button
                size='sm'
                variant='destructive'
                onClick={onConfirmDelete}
                disabled={loading}
              >
                {t('extracted.spendingCategoriesManager.categorySummary.confirm_eebdd24a')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={onCancelDelete}
              >
                {t('extracted.spendingCategoriesManager.categorySummary.cancel_19766ed6')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size='sm'
                variant='outline'
                onClick={onStartEdit}
                disabled={loading}
                data-pw='spending-category-edit-button'
              >
                {t('extracted.spendingCategoriesManager.categorySummary.edit_464c4ffd')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={onStartDelete}
                disabled={loading}
                data-pw='spending-category-remove-button'
              >
                {t('extracted.spendingCategoriesManager.categorySummary.remove_c3812fc4')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
