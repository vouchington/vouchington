import assert from 'http-assert'
import { CREDIT_SCORE_RANGES } from '@ts-shared/data-points'
import {
  isCurrencyCode,
  isMoney,
  isMoneyRange,
  type CurrencyCode,
  type Money,
  type MoneyRange,
} from '@ts-shared/money'

const VALID_CREDIT_SCORE_RANGES = CREDIT_SCORE_RANGES.map(o => o.value)

export type UserFinancialProfileInput = {
  currency?: CurrencyCode
  credit_score_range?: string | null
  stated_income_range?: MoneyRange | null
  total_credit_limit?: Money | null
  years_of_credit_history?: number | null
  hard_inquiries_12m?: number | null
  cards_opened_24m?: number | null
}

export function assertValidFinancialProfile(data: Record<string, unknown>): void {
  if ('currency' in data) {
    assert(
      isCurrencyCode(data.currency),
      422,
      'currency must be a supported lowercase currency code',
    )
  }
  if (data.credit_score_range != null) {
    assert(
      typeof data.credit_score_range === 'string' &&
        (VALID_CREDIT_SCORE_RANGES as string[]).includes(data.credit_score_range),
      422,
      `credit_score_range must be one of: ${VALID_CREDIT_SCORE_RANGES.join(', ')}`,
    )
  }

  if (data.stated_income_range != null) {
    assert(
      isMoneyRange(data.stated_income_range),
      422,
      'stated_income_range must be a valid money range',
    )
  }

  if (data.total_credit_limit != null) {
    assert(isMoney(data.total_credit_limit), 422, 'total_credit_limit must be valid money')
  }

  const currencies = [
    data.currency,
    isMoneyRange(data.stated_income_range) ? data.stated_income_range.minimum.currency : undefined,
    isMoney(data.total_credit_limit) ? data.total_credit_limit.currency : undefined,
  ].filter((value): value is CurrencyCode => value !== undefined)
  assert(new Set(currencies).size <= 1, 422, 'all financial profile money must use one currency')

  if (data.years_of_credit_history != null) {
    assert(
      typeof data.years_of_credit_history === 'number' &&
        Number.isInteger(data.years_of_credit_history) &&
        data.years_of_credit_history >= 0 &&
        data.years_of_credit_history <= 100,
      422,
      'years_of_credit_history must be an integer between 0 and 100',
    )
  }

  if (data.hard_inquiries_12m != null) {
    assert(
      typeof data.hard_inquiries_12m === 'number' &&
        Number.isInteger(data.hard_inquiries_12m) &&
        data.hard_inquiries_12m >= 0 &&
        data.hard_inquiries_12m <= 100,
      422,
      'hard_inquiries_12m must be an integer between 0 and 100',
    )
  }

  if (data.cards_opened_24m != null) {
    assert(
      typeof data.cards_opened_24m === 'number' &&
        Number.isInteger(data.cards_opened_24m) &&
        data.cards_opened_24m >= 0 &&
        data.cards_opened_24m <= 100,
      422,
      'cards_opened_24m must be an integer between 0 and 100',
    )
  }
}
