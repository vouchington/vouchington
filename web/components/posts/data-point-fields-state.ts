import type { FinancialProfile } from '@/types/my'
import type { CurrencyCode } from '@ts-shared/money'
import type { DataPointVertical } from '@voucha/types/entities/data-point'
import type { StructuredDataState } from './data-point-fields'

const CREDIT_CARD_ONLY_KEYS = new Set([
  'hard_inquiries_12m',
  'cards_opened_24m',
  'credit_limit',
  'total_credit_limit_all_cards',
  'years_of_credit_history',
  'is_business_application',
  'application_method',
])
const BANK_ACCOUNT_ONLY_KEYS = new Set([
  'account_type',
  'bonus_amount',
  'bonus_requirements',
  'minimum_balance_requirement',
  'direct_deposit_setup',
])
const MONEY_KEYS = new Set([
  'credit_limit',
  'total_credit_limit_all_cards',
  'bonus_amount',
  'minimum_balance_requirement',
  'stated_income_range',
])

export function prepareDataForVertical(
  vertical: DataPointVertical,
  structuredData: StructuredDataState,
  userFinancialProfile: FinancialProfile | null | undefined,
): StructuredDataState {
  const keysToRemove = vertical === 'credit_card' ? BANK_ACCOUNT_ONLY_KEYS : CREDIT_CARD_ONLY_KEYS
  const preserveTotalCreditLimitClear =
    vertical === 'bank_account' && structuredData.total_credit_limit_all_cards === null
  const next = Object.fromEntries(
    Object.entries(structuredData).filter(([key]) => !keysToRemove.has(key)),
  )
  if (preserveTotalCreditLimitClear) next.total_credit_limit_all_cards = null
  next.currency ??= userFinancialProfile?.currency ?? 'usd'
  if (!userFinancialProfile) return next

  seedMissing(next, [
    ['credit_score_range', userFinancialProfile.credit_score_range],
    ...(vertical === 'credit_card'
      ? ([
          ['hard_inquiries_12m', userFinancialProfile.hard_inquiries_12m],
          ['cards_opened_24m', userFinancialProfile.cards_opened_24m],
          ['years_of_credit_history', userFinancialProfile.years_of_credit_history],
        ] as Array<[string, unknown]>)
      : []),
  ])
  if (next.currency === userFinancialProfile.currency) {
    seedMissing(next, [
      ['stated_income_range', userFinancialProfile.stated_income_range],
      ...(vertical === 'credit_card'
        ? ([['total_credit_limit_all_cards', userFinancialProfile.total_credit_limit]] as Array<
            [string, unknown]
          >)
        : []),
    ])
  }
  return next
}

export function changeStructuredDataCurrency(
  previous: StructuredDataState,
  currency: CurrencyCode,
): StructuredDataState {
  return {
    ...Object.fromEntries(
      Object.entries({ ...previous, currency }).filter(
        ([key]) => !MONEY_KEYS.has(key) || key === 'currency',
      ),
    ),
    stated_income_range: null,
    total_credit_limit_all_cards: null,
  }
}

function seedMissing(target: StructuredDataState, fields: Array<[string, unknown]>): void {
  for (const [key, value] of fields) {
    if (value != null && target[key] === undefined) target[key] = value
  }
}
