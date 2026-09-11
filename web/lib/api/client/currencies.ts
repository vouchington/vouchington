'use client'

import { clientApi } from './instance'
import type { Currency } from '@ts-shared/money'
import type { PageInfo } from '@/types/api-responses'

export type CurrenciesResponseBody = {
  results: Currency[]
  page_info: PageInfo
}

export function fetchCurrencies(after?: string): Promise<CurrenciesResponseBody> {
  const query = after ? `?after=${encodeURIComponent(after)}` : ''
  return clientApi.get<CurrenciesResponseBody>(`/api/v1/currencies${query}`)
}
