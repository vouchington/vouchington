'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'

export function SpendingCategorySection({
  isForeignTransaction,
  onSpendingSubmit,
  setIsForeignTransaction,
  setSpendingFrequency,
  spendingFrequency,
  spendingSaving,
}: {
  isForeignTransaction: boolean
  onSpendingSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  setIsForeignTransaction: (isForeignTransaction: boolean) => void
  setSpendingFrequency: (spendingFrequency: string) => void
  spendingFrequency: string
  spendingSaving: boolean
}) {
  const t = useTranslations()
  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2
        data-pw='spending-category-heading'
        className='mb-4 text-xl font-semibold text-foreground'
      >
        {t('extracted.settings.spendingCategorySection.spendingCategory_3b0b89f9')}
      </h2>
      <form
        onSubmit={onSpendingSubmit}
        className='space-y-4'
      >
        <div className='flex items-center gap-2'>
          <Checkbox
            id='is_foreign_transaction'
            checked={isForeignTransaction}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              setIsForeignTransaction(checked === true)
            }
          />
          <Label htmlFor='is_foreign_transaction'>
            {t('extracted.settings.spendingCategorySection.isForeignTransaction_e9748fbf')}
          </Label>
        </div>
        <div>
          <Label htmlFor='default_spending_frequency'>
            {t('extracted.settings.spendingCategorySection.defaultSpendingFrequency_6b4728db')}
          </Label>
          <Select
            value={spendingFrequency}
            onValueChange={setSpendingFrequency}
          >
            <SelectTrigger
              id='default_spending_frequency'
              data-pw='default-spending-frequency-trigger'
              className='mt-1'
            >
              <SelectValue
                placeholder={t('extracted.settings.spendingCategorySection.none_b5e7648a')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='daily'>
                {t('extracted.settings.spendingCategorySection.daily_b36c2611')}
              </SelectItem>
              <SelectItem value='weekly'>
                {t('extracted.settings.spendingCategorySection.weekly_29751324')}
              </SelectItem>
              <SelectItem
                value='monthly'
                data-pw='spending-frequency-monthly'
              >
                {t('extracted.settings.spendingCategorySection.monthly_9b11f6b7')}
              </SelectItem>
              <SelectItem value='yearly'>
                {t('extracted.settings.spendingCategorySection.yearly_6e69b59e')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type='submit'
          data-pw='save-spending-category'
          loading={spendingSaving}
          disabled={spendingSaving}
        >
          {spendingSaving
            ? t('extracted.settings.spendingCategorySection.saving_dc85af8f')
            : t('extracted.settings.spendingCategorySection.saveSpendingCategory_1bffb47a')}
        </Button>
      </form>
    </section>
  )
}
