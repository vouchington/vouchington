'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'

export type SpendingFrequency = 'monthly' | 'annually'

export function FrequencySelect({
  id,
  onChange,
  value,
}: {
  id: string
  onChange: (value: SpendingFrequency) => void
  value: SpendingFrequency
}) {
  const t = useTranslations()
  return (
    <Select
      value={value}
      onValueChange={nextValue => onChange(nextValue as SpendingFrequency)}
    >
      <SelectTrigger id={id}>
        <SelectValue
          placeholder={t(
            'extracted.spendingCategoriesManager.frequencySelect.selectFrequency_c3ab5d00',
          )}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='monthly'>
          {t('extracted.spendingCategoriesManager.frequencySelect.monthly_9b11f6b7')}
        </SelectItem>
        <SelectItem value='annually'>
          {t('extracted.spendingCategoriesManager.frequencySelect.annually_1ec9d1d5')}
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
