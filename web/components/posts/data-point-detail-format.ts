import {
  APPLICATION_METHODS,
  BANK_ACCOUNT_RESULTS,
  BANK_ACCOUNT_TYPES,
  CREDIT_CARD_RESULTS,
} from '@ts-shared/data-points'
import type { MoneyRange } from '@ts-shared/money'
import { formatMoney } from '@/lib/money'

export const CREDIT_CARD_RESULT_LABELS: Record<string, string> = Object.fromEntries(
  CREDIT_CARD_RESULTS.map(o => [o.value, o.label]),
)
export const BANK_ACCOUNT_RESULT_LABELS: Record<string, string> = Object.fromEntries(
  BANK_ACCOUNT_RESULTS.map(o => [o.value, o.label]),
)
export const APPLICATION_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  APPLICATION_METHODS.map(o => [o.value, o.label]),
)
export const BANK_ACCOUNT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  BANK_ACCOUNT_TYPES.map(o => [o.value, o.label]),
)
export function formatMoneyRange(range: MoneyRange, locale: string): string {
  const minimum = formatMoney(range.minimum, locale)
  return range.maximum ? `${minimum} to ${formatMoney(range.maximum, locale)}` : `${minimum}+`
}
