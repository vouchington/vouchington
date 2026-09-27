import type { Money, MoneyRange } from '@ts-shared/money'
import type { StructuredDataPoint } from './types.mts'

type Presence = 'absent' | 'null' | 'present'

type MoneyColumns = {
  presence: Presence
  amount: number | null
  currency: string | null
}

type MoneyRangeColumns = {
  presence: Presence
  minimumAmount: number | null
  minimumCurrency: string | null
  maximumPresence: 'null' | 'present' | null
  maximumAmount: number | null
  maximumCurrency: string | null
}

export function toDataPointFactColumns(data: StructuredDataPoint) {
  const statedIncome = moneyRangeColumns(data.stated_income_range)
  const shared = {
    vertical: data.vertical,
    schemaVersion: data.schema_version,
    result: data.result,
    currency: data.currency,
    statedIncome,
    existingRelationship: optionalBoolean(data.existing_relationship),
    applicationDate: nullableText(data.application_date),
    applicationDatePresence: presenceOf(data.application_date),
  }
  if (data.vertical === 'credit_card') {
    return {
      ...shared,
      creditScoreRange: data.credit_score_range,
      creditScoreRangePresence: 'present' as const,
      hardInquiries12m: nullableNumber(data.hard_inquiries_12m),
      hardInquiries12mPresence: presenceOf(data.hard_inquiries_12m),
      cardsOpened24m: nullableNumber(data.cards_opened_24m),
      cardsOpened24mPresence: presenceOf(data.cards_opened_24m),
      creditLimit: moneyColumns(data.credit_limit),
      totalCreditLimit: moneyColumns(data.total_credit_limit_all_cards),
      yearsOfCreditHistory: nullableNumber(data.years_of_credit_history),
      yearsOfCreditHistoryPresence: presenceOf(data.years_of_credit_history),
      isBusinessApplication: optionalBoolean(data.is_business_application),
      applicationMethod: nullableText(data.application_method),
      applicationMethodPresence: presenceOf(data.application_method),
      accountType: null,
      accountTypePresence: 'absent' as const,
      bonusAmount: absentMoney(),
      bonusRequirements: null,
      bonusRequirementsPresence: 'absent' as const,
      minimumBalance: absentMoney(),
      directDepositSetup: null,
    }
  }
  return {
    ...shared,
    creditScoreRange: nullableText(data.credit_score_range),
    creditScoreRangePresence: presenceOf(data.credit_score_range),
    hardInquiries12m: null,
    hardInquiries12mPresence: 'absent' as const,
    cardsOpened24m: null,
    cardsOpened24mPresence: 'absent' as const,
    creditLimit: absentMoney(),
    totalCreditLimit: absentMoney(),
    yearsOfCreditHistory: null,
    yearsOfCreditHistoryPresence: 'absent' as const,
    isBusinessApplication: null,
    applicationMethod: null,
    applicationMethodPresence: 'absent' as const,
    accountType: nullableText(data.account_type),
    accountTypePresence: presenceOf(data.account_type),
    bonusAmount: moneyColumns(data.bonus_amount),
    bonusRequirements: nullableText(data.bonus_requirements),
    bonusRequirementsPresence: presenceOf(data.bonus_requirements),
    minimumBalance: moneyColumns(data.minimum_balance_requirement),
    directDepositSetup: optionalBoolean(data.direct_deposit_setup),
  }
}

function presenceOf(value: unknown): Presence {
  if (value === undefined) return 'absent'
  if (value === null) return 'null'
  return 'present'
}

function optionalBoolean(value: boolean | undefined): boolean | null {
  return value === undefined ? null : value
}

function nullableText(value: string | null | undefined): string | null {
  return value ?? null
}

function nullableNumber(value: number | null | undefined): number | null {
  return value ?? null
}

function absentMoney(): MoneyColumns {
  return { presence: 'absent', amount: null, currency: null }
}

function moneyColumns(value: Money | null | undefined): MoneyColumns {
  if (value === undefined) return absentMoney()
  if (value === null) return { presence: 'null', amount: null, currency: null }
  return { presence: 'present', amount: value.amount, currency: value.currency }
}

function moneyRangeColumns(value: MoneyRange | null | undefined): MoneyRangeColumns {
  if (value === undefined) {
    return {
      presence: 'absent',
      minimumAmount: null,
      minimumCurrency: null,
      maximumPresence: null,
      maximumAmount: null,
      maximumCurrency: null,
    }
  }
  if (value === null) {
    return {
      presence: 'null',
      minimumAmount: null,
      minimumCurrency: null,
      maximumPresence: null,
      maximumAmount: null,
      maximumCurrency: null,
    }
  }
  return {
    presence: 'present',
    minimumAmount: value.minimum.amount,
    minimumCurrency: value.minimum.currency,
    maximumPresence: value.maximum === null ? 'null' : 'present',
    maximumAmount: value.maximum?.amount ?? null,
    maximumCurrency: value.maximum?.currency ?? null,
  }
}
