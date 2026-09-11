'use client'

import type { Dispatch, SetStateAction } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { DataPointVertical } from '@voucha/types/entities/data-point'
import type { FinancialProfile } from '@/types/my'
import { CreditCardFields } from './credit-card-fields'
import { BankAccountFields } from './bank-account-fields'
import { DataPointProfileFields } from './data-point-profile-fields'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CurrencySelect } from '@/components/shared/currency-select'
import type { CurrencyCode } from '@ts-shared/money'
import { changeStructuredDataCurrency, prepareDataForVertical } from './data-point-fields-state'

export type { DataPointVertical }

export type StructuredDataState = Record<string, unknown>

interface Props {
  vertical: DataPointVertical | null
  onVerticalChange: (v: DataPointVertical) => void
  structuredData: StructuredDataState
  onStructuredDataChange: Dispatch<SetStateAction<StructuredDataState>>
  userFinancialProfile?: FinancialProfile | null
  saveToProfile: boolean
  onSaveToProfileChange: (v: boolean) => void
  disabled?: boolean
}

export function DataPointFields({
  vertical,
  onVerticalChange,
  structuredData,
  onStructuredDataChange,
  userFinancialProfile,
  saveToProfile,
  onSaveToProfileChange,
  disabled,
}: Props) {
  const t = useTranslations()
  function update(key: string, value: unknown) {
    onStructuredDataChange(prev => ({ ...prev, [key]: value ?? null }))
  }

  function handleVerticalChange(v: DataPointVertical) {
    onVerticalChange(v)
    onStructuredDataChange(prepareDataForVertical(v, structuredData, userFinancialProfile))
  }

  return (
    <div className='space-y-4'>
      <p className='text-xs text-muted-foreground'>
        {t('extracted.posts.dataPointFields.fieldsMarkedWithAreRequired_f14e37ab')}
      </p>
      <CurrencySelect
        id='data-point-currency'
        value={(structuredData.currency as CurrencyCode | undefined) ?? 'usd'}
        onValueChange={currency => {
          onStructuredDataChange(previous => changeStructuredDataCurrency(previous, currency))
        }}
      />
      {/* Vertical selector */}
      <div className='space-y-1'>
        <Label
          htmlFor='dp-vertical'
          data-pw='data-point-vertical-label'
        >
          {t('extracted.posts.dataPointFields.category_1539ace7')}
        </Label>
        <Select
          disabled={disabled}
          value={vertical ?? ''}
          onValueChange={v => handleVerticalChange(v as DataPointVertical)}
        >
          <SelectTrigger
            id='dp-vertical'
            data-pw='data-point-vertical-trigger'
          >
            <SelectValue
              placeholder={t('extracted.posts.dataPointFields.selectCategory_e26788c5')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value='credit_card'
              data-pw='data-point-vertical-option-credit-card'
            >
              {t('extracted.posts.dataPointFields.creditCard_9f629f57')}
            </SelectItem>
            <SelectItem
              value='bank_account'
              data-pw='data-point-vertical-option-bank-account'
            >
              {t('extracted.posts.dataPointFields.bankAccount_c6f645d8')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Profile-specific fields — shown once a vertical is selected */}
      {vertical !== null && (
        <DataPointProfileFields
          vertical={vertical}
          data={structuredData}
          onUpdate={update}
          userFinancialProfile={userFinancialProfile}
          saveToProfile={saveToProfile}
          onSaveToProfileChange={onSaveToProfileChange}
          disabled={disabled}
        />
      )}

      {/* Data-point-specific fields */}
      {vertical === 'credit_card' && (
        <CreditCardFields
          data={structuredData}
          onUpdate={update}
          disabled={disabled}
        />
      )}

      {vertical === 'bank_account' && (
        <BankAccountFields
          data={structuredData}
          onUpdate={update}
          disabled={disabled}
        />
      )}
    </div>
  )
}
