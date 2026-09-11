'use client'

import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FinancialProfile } from '@/types/my'
import type { DataPointVertical } from './data-point-fields'
import { CREDIT_SCORE_RANGES } from '@ts-shared/data-points'
import { DataPointCreditCardProfileFields } from './data-point-credit-card-profile-fields'
import { useTranslations } from '@/lib/i18n/use-translations'
import { BankAccountMoneyInput } from './bank-account-money-input'
import type { CurrencyCode, MoneyRange } from '@ts-shared/money'

interface Props {
  vertical: DataPointVertical
  data: Record<string, unknown>
  onUpdate: (key: string, value: unknown) => void
  userFinancialProfile?: FinancialProfile | null
  saveToProfile: boolean
  onSaveToProfileChange: (v: boolean) => void
  disabled?: boolean
}

export function DataPointProfileFields({
  vertical,
  data,
  onUpdate,
  userFinancialProfile,
  saveToProfile,
  onSaveToProfileChange,
  disabled,
}: Props) {
  // '__none__' is only meaningful when there is a matching "Not specified" SelectItem
  // (bank_account). For credit_card (required field, no such item), use '' so Radix
  // renders the placeholder instead of leaving the select with an unmatched value.
  const t = useTranslations()
  const creditScoreNullSentinel = vertical === 'bank_account' ? '__none__' : ''
  const currency =
    (data.currency as CurrencyCode | undefined) ?? userFinancialProfile?.currency ?? 'usd'
  const profileIncomeRange =
    userFinancialProfile?.currency === currency
      ? userFinancialProfile.stated_income_range
      : undefined
  const incomeRange =
    data.stated_income_range !== undefined
      ? (data.stated_income_range as MoneyRange | null)
      : profileIncomeRange

  return (
    <fieldset className='space-y-3 rounded-md border p-4'>
      <legend
        className='px-1 text-sm font-medium'
        data-pw='data-point-profile-legend'
      >
        {t('extracted.posts.dataPointProfileFields.yourProfile_7289f8ec')}
      </legend>

      {/* Credit score range — both verticals */}
      <div className='space-y-1'>
        <Label
          htmlFor='dp-profile-credit-score'
          data-pw='data-point-credit-score-label'
        >
          {vertical === 'credit_card'
            ? t('extracted.posts.dataPointProfileFields.creditScoreRange_31563982')
            : t('extracted.posts.dataPointProfileFields.creditScoreRangeOptional_6574c2c8')}
        </Label>
        <Select
          disabled={disabled}
          value={
            data.credit_score_range !== undefined
              ? ((data.credit_score_range as string) ?? creditScoreNullSentinel)
              : (userFinancialProfile?.credit_score_range ?? creditScoreNullSentinel)
          }
          onValueChange={v => onUpdate('credit_score_range', v === '__none__' ? null : v)}
        >
          <SelectTrigger
            id='dp-profile-credit-score'
            data-pw='data-point-credit-score-trigger'
          >
            <SelectValue
              placeholder={t('extracted.posts.dataPointProfileFields.selectRange_7ee47c02')}
            />
          </SelectTrigger>
          <SelectContent>
            {vertical === 'bank_account' && (
              <SelectItem value='__none__'>
                {t('extracted.posts.dataPointProfileFields.notSpecified_dc12bec5')}
              </SelectItem>
            )}
            {CREDIT_SCORE_RANGES.map(r => (
              <SelectItem
                key={r.value}
                value={r.value}
              >
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stated income range — both verticals */}
      <div className='grid gap-3 sm:grid-cols-2'>
        <div data-pw='data-point-income-minimum-field'>
          <BankAccountMoneyInput
            id='dp-profile-income-minimum'
            label={t('extracted.posts.dataPointProfileFields.incomeMinimumOptional_ed59d880')}
            disabled={disabled}
            money={incomeRange?.minimum}
            currency={currency}
            onChange={minimum =>
              onUpdate(
                'stated_income_range',
                minimum ? { minimum, maximum: incomeRange?.maximum ?? null } : null,
              )
            }
          />
        </div>
        <div data-pw='data-point-income-maximum-field'>
          <BankAccountMoneyInput
            id='dp-profile-income-maximum'
            label={t('extracted.posts.dataPointProfileFields.incomeMaximumOptional_e65be3d8')}
            disabled={disabled || !incomeRange}
            money={incomeRange?.maximum}
            currency={currency}
            onChange={maximum =>
              incomeRange && onUpdate('stated_income_range', { ...incomeRange, maximum })
            }
          />
        </div>
      </div>

      {vertical === 'credit_card' && (
        <DataPointCreditCardProfileFields
          data={data}
          disabled={disabled}
          onUpdate={onUpdate}
          userFinancialProfile={userFinancialProfile}
        />
      )}

      <div className='flex items-center gap-2 pt-1'>
        <Checkbox
          id='dp-save-to-profile'
          disabled={disabled}
          checked={saveToProfile}
          onCheckedChange={(checked: boolean | 'indeterminate') =>
            onSaveToProfileChange(checked === true)
          }
          data-pw='data-point-save-to-profile-checkbox'
        />
        <Label
          htmlFor='dp-save-to-profile'
          className='text-sm font-normal text-muted-foreground'
        >
          {t('extracted.posts.dataPointProfileFields.saveChangesToMyProfile_d8904478')}
        </Label>
      </div>
    </fieldset>
  )
}
