'use client'

import { useEffect, useState } from 'react'
import { CURRENCIES, type Currency, type CurrencyCode } from '@ts-shared/money'
import { fetchCurrencies } from '@/lib/api/client/currencies'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CurrencySelect({
  id,
  value,
  onValueChange,
  label,
}: {
  id: string
  value: CurrencyCode
  onValueChange: (currency: CurrencyCode) => void
  label?: string
}) {
  const t = useTranslations()
  const resolvedLabel = label ?? t('common.currency')
  const [currencies, setCurrencies] = useState<readonly Currency[]>(CURRENCIES)
  useEffect(() => {
    let active = true
    void fetchCurrencies()
      .then(response => {
        if (active && response.results.length > 0) setCurrencies(response.results)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  return (
    <div className='space-y-1'>
      <Label htmlFor={id}>{resolvedLabel}</Label>
      <Select
        value={value}
        onValueChange={value => onValueChange(value as CurrencyCode)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {currencies.map(currency => (
            <SelectItem
              key={currency.code}
              value={currency.code}
            >
              {currency.code.toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
