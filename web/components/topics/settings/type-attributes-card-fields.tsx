'use client'

import { useState } from 'react'
import { CurrencySelect } from '@/components/shared/currency-select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'
import { compatibleMoneyInputValue, majorUnitsInputValue } from '@/lib/money'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { TopicIdAttribute } from './type-attributes-fields'
import type { TopicIdField, TypeAttributeNames, TypeAttributes } from './topic-edit-model'

export function CardFields({
  typeAttributes,
  getValue,
  names,
  setId,
  disabled,
  annualFeeError,
  onAnnualFeeChange,
}: {
  typeAttributes: TypeAttributes | null
  getValue: (field: TopicIdField) => string | null
  names: TypeAttributeNames
  setId: (field: TopicIdField) => (id: string) => void
  disabled: boolean
  annualFeeError: string | null
  onAnnualFeeChange: () => void
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const annualFee = typeAttributes?.annual_fee
  const [annualFeeCurrency, setAnnualFeeCurrency] = useState(annualFee?.currency ?? 'usd')
  const [annualFeeAmount, setAnnualFeeAmount] = useState(
    annualFee ? majorUnitsInputValue(annualFee) : '',
  )
  return (
    <>
      <TopicIdAttribute
        fieldId='bank_id'
        label={t('extracted.settings.typeAttributesFields.bank_676c471b')}
        value={getValue('bank_id')}
        name={names.bank_id}
        onChange={setId('bank_id')}
        disabled={disabled}
      />
      <TopicIdAttribute
        fieldId='brand_id'
        label={t('extracted.settings.typeAttributesFields.brand_090ed431')}
        value={getValue('brand_id')}
        name={names.brand_id}
        onChange={setId('brand_id')}
        disabled={disabled}
      />
      <TopicIdAttribute
        fieldId='rewards_program_id'
        label={t('extracted.settings.typeAttributesFields.rewardsProgram_f76a1d04')}
        value={getValue('rewards_program_id')}
        name={names.rewards_program_id}
        onChange={setId('rewards_program_id')}
        disabled={disabled}
      />
      <TopicIdAttribute
        fieldId='referral_program_id'
        label={t('extracted.settings.typeAttributesFields.referralProgram_c4f204bd')}
        value={getValue('referral_program_id')}
        name={names.referral_program_id}
        onChange={setId('referral_program_id')}
        disabled={disabled}
      />
      <div className='grid gap-3 sm:grid-cols-2'>
        <div>
          <Label htmlFor='annual_fee_amount'>
            {t('extracted.settings.typeAttributesFields.annualFee_3110c32f')}
          </Label>
          <Input
            type='text'
            inputMode='decimal'
            id='annual_fee_amount'
            name='annual_fee_amount'
            value={annualFeeAmount}
            onChange={event => {
              setAnnualFeeAmount(event.target.value)
              onAnnualFeeChange()
            }}
            placeholder='0'
            className='mt-1'
            disabled={disabled}
            aria-invalid={annualFeeError !== null}
            aria-describedby={annualFeeError ? 'annual-fee-error' : undefined}
          />
          {annualFeeError && (
            <p
              id='annual-fee-error'
              role='alert'
              className='mt-1 text-sm text-destructive'
            >
              {annualFeeError}
            </p>
          )}
        </div>
        <CurrencySelect
          id='annual_fee_currency'
          value={annualFeeCurrency}
          onValueChange={currency => {
            onAnnualFeeChange()
            setAnnualFeeAmount(compatibleMoneyInputValue(annualFeeAmount, currency, uiLocale))
            setAnnualFeeCurrency(currency)
          }}
        />
        <Input
          type='hidden'
          name='annual_fee_currency'
          value={annualFeeCurrency}
        />
      </div>
    </>
  )
}
