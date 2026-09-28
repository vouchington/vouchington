import { asIdList } from './revision-scalars.mts'

const CREDIT_KEYS = new Set([
  'vertical',
  'schema_version',
  'topic_ids',
  'result',
  'currency',
  'credit_score_range',
  'stated_income_range',
  'existing_relationship',
  'hard_inquiries_12m',
  'cards_opened_24m',
  'credit_limit',
  'total_credit_limit_all_cards',
  'years_of_credit_history',
  'is_business_application',
  'application_method',
  'application_date',
])
const BANK_KEYS = new Set([
  'vertical',
  'schema_version',
  'topic_ids',
  'result',
  'currency',
  'account_type',
  'credit_score_range',
  'stated_income_range',
  'existing_relationship',
  'bonus_amount',
  'bonus_requirements',
  'minimum_balance_requirement',
  'direct_deposit_setup',
  'application_date',
])

export type DataPointRow = {
  has: (key: string) => boolean
  values: Record<string, unknown>
  topicIds: string[]
  incomeMinAmount: number | null
  incomeMinCurrency: string | null
  incomeMaxAbsent: boolean
  incomeMaxAmount: number | null
  incomeMaxCurrency: string | null
  creditLimitAmount: number | null
  creditLimitCurrency: string | null
  totalLimitAmount: number | null
  totalLimitCurrency: string | null
  bonusAmount: number | null
  bonusCurrency: string | null
  minimumAmount: number | null
  minimumCurrency: string | null
}

export function asDataPoint(value: unknown): DataPointRow {
  if (!isRecord(value)) throw new Error('Post revision structured_data must be an object or null')
  const vertical = value.vertical
  const allowed =
    vertical === 'bank_account'
      ? BANK_KEYS
      : vertical === 'credit_card'
        ? CREDIT_KEYS
        : new Set([...CREDIT_KEYS, ...BANK_KEYS])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown structured_data revision field: ${key}`)
  }
  const income = moneyRange(value.stated_income_range, 'stated_income_range')
  const creditLimit = optionalMoney(value, 'credit_limit')
  const totalLimit = optionalMoney(value, 'total_credit_limit_all_cards')
  const bonus = optionalMoney(value, 'bonus_amount')
  const minimum = optionalMoney(value, 'minimum_balance_requirement')
  return {
    has: key => Object.hasOwn(value, key),
    values: value,
    topicIds: asIdList(value.topic_ids ?? [], 'topic_ids'),
    incomeMinAmount: income?.minAmount ?? null,
    incomeMinCurrency: income?.minCurrency ?? null,
    incomeMaxAbsent: income?.maxAbsent ?? false,
    incomeMaxAmount: income?.maxAmount ?? null,
    incomeMaxCurrency: income?.maxCurrency ?? null,
    creditLimitAmount: creditLimit?.amount ?? null,
    creditLimitCurrency: creditLimit?.currency ?? null,
    totalLimitAmount: totalLimit?.amount ?? null,
    totalLimitCurrency: totalLimit?.currency ?? null,
    bonusAmount: bonus?.amount ?? null,
    bonusCurrency: bonus?.currency ?? null,
    minimumAmount: minimum?.amount ?? null,
    minimumCurrency: minimum?.currency ?? null,
  }
}

function optionalMoney(
  value: Record<string, unknown>,
  key: string,
): { amount: number | null; currency: string | null } | null {
  if (!Object.hasOwn(value, key) || value[key] === null) return null
  return asMoney(value[key], key)
}

function moneyRange(
  value: unknown,
  field: string,
): {
  minAmount: number | null
  minCurrency: string | null
  maxAbsent: boolean
  maxAmount: number | null
  maxCurrency: string | null
} | null {
  if (value === undefined || value === null) return null
  if (!isRecord(value))
    throw new Error(`Post revision structured_data.${field} must be an object or null`)
  const minimum = asMoney(value.minimum, `${field}.minimum`)
  if (value.maximum === null) {
    return {
      minAmount: minimum.amount,
      minCurrency: minimum.currency,
      maxAbsent: true,
      maxAmount: null,
      maxCurrency: null,
    }
  }
  const maximum = asMoney(value.maximum, `${field}.maximum`)
  return {
    minAmount: minimum.amount,
    minCurrency: minimum.currency,
    maxAbsent: false,
    maxAmount: maximum.amount,
    maxCurrency: maximum.currency,
  }
}

function asMoney(value: unknown, field: string): { amount: number; currency: string } {
  if (!isRecord(value) || typeof value.amount !== 'number' || typeof value.currency !== 'string') {
    throw new Error(`Post revision structured_data.${field} must be money`)
  }
  return { amount: value.amount, currency: value.currency }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
