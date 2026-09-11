'use client'

import { clientApi } from './instance'
import type { FinancialProfileResponseBody } from '@/types/api-responses'
import type { CurrencyCode, Money, MoneyRange } from '@ts-shared/money'

export function updateMyFinancialProfile(body: {
  currency?: CurrencyCode
  credit_score_range?: string | null
  stated_income_range?: MoneyRange | null
  total_credit_limit?: Money | null
  years_of_credit_history?: number | null
  hard_inquiries_12m?: number | null
  cards_opened_24m?: number | null
}): Promise<FinancialProfileResponseBody> {
  return clientApi.put<FinancialProfileResponseBody>('/api/v1/my/financial-profile', body)
}
