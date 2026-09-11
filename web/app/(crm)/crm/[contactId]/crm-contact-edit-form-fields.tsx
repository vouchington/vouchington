'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CrmContactVertical } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CrmContactEditFields } from './crm-contact-edit-form'

const VERTICAL_OPTION_VALUES: CrmContactVertical[] = [
  'credit_cards',
  'travel',
  'cars',
  'ai',
  'technology',
  'finance',
  'lifestyle',
  'other',
]

export function TextField({
  field,
  id,
  label,
  onFieldChange,
  value,
  ...inputProps
}: {
  field: keyof CrmContactEditFields
  id: string
  label: string
  onFieldChange: (field: keyof CrmContactEditFields, value: string) => void
  value: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const t = useTranslations()
  return (
    <div className='space-y-1'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={event => onFieldChange(field, event.target.value)}
        placeholder={
          inputProps.placeholder ??
          t('extracted.contactid.crmContactEditForm.contactLabel_1fcbfd08', {
            label: label.toLowerCase(),
          })
        }
        {...inputProps}
      />
    </div>
  )
}

export function VerticalField({
  onFieldChange,
  value,
}: {
  onFieldChange: (field: keyof CrmContactEditFields, value: string) => void
  value: string
}) {
  const t = useTranslations()
  const verticalLabels: Record<CrmContactVertical, string> = {
    credit_cards: t('extracted.contactid.crmContactEditForm.creditCards_dfbad0ff'),
    travel: t('extracted.contactid.crmContactEditForm.travel_d2b98fb5'),
    cars: t('extracted.contactid.crmContactEditForm.cars_9e499e4c'),
    ai: t('extracted.contactid.crmContactEditForm.ai_11fb682b'),
    technology: t('extracted.contactid.crmContactEditForm.technology_3169ce64'),
    finance: t('extracted.contactid.crmContactEditForm.finance_b696d755'),
    lifestyle: t('extracted.contactid.crmContactEditForm.lifestyle_2e6c28eb'),
    other: t('extracted.contactid.crmContactEditForm.other_f97e9da0'),
  }
  const noneLabel = t('extracted.contactid.crmContactEditForm.none_dc937b59')
  return (
    <div className='space-y-1'>
      <Label htmlFor='edit-vertical'>
        {t('extracted.contactid.crmContactEditForm.vertical_727cd3a6')}
      </Label>
      <Select
        value={value}
        onValueChange={nextValue => onFieldChange('vertical', nextValue)}
      >
        <SelectTrigger id='edit-vertical'>
          <SelectValue placeholder={noneLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='none'>{noneLabel}</SelectItem>
          {VERTICAL_OPTION_VALUES.map(v => (
            <SelectItem
              key={v}
              value={v}
            >
              {verticalLabels[v]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
