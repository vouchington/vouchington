import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { UserFinancialProfile } from './types.mts'
import {
  parsePostgresMoneyAmount,
  type CurrencyCode,
  type Money,
  type MoneyRange,
} from '@ts-shared/money'

export type UserFinancialProfileRow = {
  individual_id: string
  credit_score_range: UserFinancialProfile['credit_score_range']
  stated_income_minimum_minor_units: string | null
  stated_income_maximum_minor_units: string | null
  total_credit_limit_minor_units: string | null
  currency_code: CurrencyCode
  years_of_credit_history: number | null
  hard_inquiries_12m: number | null
  cards_opened_24m: number | null
  updated_at: Date
}

export function toUserFinancialProfile(row: UserFinancialProfileRow): UserFinancialProfile {
  const money = (amount: string): Money => ({
    amount: parsePostgresMoneyAmount(amount),
    currency: row.currency_code,
  })
  const statedIncomeRange: MoneyRange | null =
    row.stated_income_minimum_minor_units === null
      ? null
      : {
          minimum: money(row.stated_income_minimum_minor_units),
          maximum:
            row.stated_income_maximum_minor_units === null
              ? null
              : money(row.stated_income_maximum_minor_units),
        }
  return {
    individual_id: row.individual_id,
    credit_score_range: row.credit_score_range,
    stated_income_range: statedIncomeRange,
    total_credit_limit:
      row.total_credit_limit_minor_units === null
        ? null
        : money(row.total_credit_limit_minor_units),
    currency: row.currency_code,
    years_of_credit_history: row.years_of_credit_history,
    hard_inquiries_12m: row.hard_inquiries_12m,
    cards_opened_24m: row.cards_opened_24m,
    updated_at: row.updated_at,
  }
}

export async function getUserFinancialProfile(
  userId: string,
): Promise<UserFinancialProfile | null> {
  const { rows } = await read<UserFinancialProfileRow>(sql`/* getUserFinancialProfile */
    SELECT
      ifp.individual_id,
      ifp.credit_score_range,
      ifp.stated_income_minimum_minor_units::TEXT AS stated_income_minimum_minor_units,
      ifp.stated_income_maximum_minor_units::TEXT AS stated_income_maximum_minor_units,
      ifp.total_credit_limit_minor_units::TEXT AS total_credit_limit_minor_units,
      ifp.currency_code,
      ifp.years_of_credit_history,
      ifp.hard_inquiries_12m,
      ifp.cards_opened_24m,
      ifp.updated_at
    FROM individual_financial_profiles ifp
    JOIN users u ON u.individual_id = ifp.individual_id
    WHERE u.id = ${userId}
  `)
  return rows[0] ? toUserFinancialProfile(rows[0]) : null
}
