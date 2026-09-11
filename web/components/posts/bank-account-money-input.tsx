'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CurrencyCode, Money } from '@ts-shared/money'
import { majorUnitsInputValue } from '@/lib/money'
import { parseMajorUnitMoneyDraft } from '@/lib/money-input-draft'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useState } from 'react'

interface Props {
  id: string
  label: string
  disabled?: boolean
  money: Money | null | undefined
  currency: CurrencyCode
  onChange: (money: Money | null) => void
}

export function BankAccountMoneyInput({ id, label, disabled, money, currency, onChange }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const currencyIndicator = currency.toUpperCase()
  const currencyDescriptionId = `${id}-currency`
  const externalValue = money ? majorUnitsInputValue(money) : ''
  const [inputState, setInputState] = useState(() => ({
    externalValue,
    currency,
    uiLocale,
    draft: externalValue,
  }))
  let currentInputState = inputState
  if (
    inputState.externalValue !== externalValue ||
    inputState.currency !== currency ||
    inputState.uiLocale !== uiLocale
  ) {
    currentInputState = { externalValue, currency, uiLocale, draft: externalValue }
    setInputState(currentInputState)
  }

  return (
    <div className='space-y-1'>
      <Label htmlFor={id}>{label}</Label>
      <div className='relative'>
        <span
          id={currencyDescriptionId}
          className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-muted-foreground text-sm'
        >
          {currencyIndicator}
        </span>
        <Input
          id={id}
          aria-describedby={currencyDescriptionId}
          type='text'
          inputMode={currency === 'jpy' ? 'numeric' : 'decimal'}
          pattern={currency === 'jpy' ? '[0-9]*' : '[0-9]*([.,][0-9]*)?'}
          disabled={disabled}
          className='pl-14'
          value={currentInputState.draft}
          onChange={e => {
            const nextDraft = e.target.value
            const parsedDraft = parseMajorUnitMoneyDraft(nextDraft, currency, uiLocale)
            if (!parsedDraft.accepted) return
            const nextExternalValue = parsedDraft.money
              ? majorUnitsInputValue(parsedDraft.money)
              : ''
            setInputState({
              externalValue: nextExternalValue,
              currency,
              uiLocale,
              draft: nextDraft,
            })
            onChange(parsedDraft.money)
          }}
          placeholder={t('extracted.posts.bankAccountMoneyInput.0_5feceb66')}
        />
      </div>
    </div>
  )
}
