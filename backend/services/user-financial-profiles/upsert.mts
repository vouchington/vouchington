import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { UserFinancialProfile } from './types.mts'
import type { UserFinancialProfileInput } from './validate.mts'
import { toUserFinancialProfile, type UserFinancialProfileRow } from './get.mts'
import assert from 'http-assert'
import type { CurrencyCode } from '@ts-shared/money'

const DEFAULT_FINANCIAL_PROFILE_CURRENCY: CurrencyCode = 'usd'

export async function upsertUserFinancialProfile(
  userId: string,
  input: UserFinancialProfileInput,
): Promise<UserFinancialProfile> {
  await using transactionQuery = await beginTransaction()
  const ownerResult = await transactionQuery<{ individual_id: string }>(
    sql`/* upsertUserFinancialProfile:lockOwner */
        SELECT i.id AS individual_id
        FROM users u
        JOIN individuals i ON i.id = u.individual_id
        WHERE u.id = ${userId}
        FOR UPDATE OF i
      `,
  )
  const individualId = ownerResult.rows[0]?.individual_id
  assert(individualId, 404, 'User not found')

  const existingResult = await transactionQuery<{
    currency_code: CurrencyCode
  }>(sql`/* upsertUserFinancialProfile */
      SELECT currency_code
      FROM individual_financial_profiles ifp
      WHERE individual_id = ${individualId}
      FOR UPDATE
    `)
  const existingCurrency = existingResult.rows[0]?.currency_code
  if (input.currency !== undefined && existingCurrency && input.currency !== existingCurrency) {
    assert(
      input.stated_income_range !== undefined && input.total_credit_limit !== undefined,
      422,
      'changing currency requires replacing or clearing every monetary field',
    )
  }
  const moneyCurrencies = [
    input.stated_income_range?.minimum.currency,
    input.total_credit_limit?.currency,
  ].filter(value => value !== undefined)
  const currency =
    input.currency ?? existingCurrency ?? moneyCurrencies[0] ?? DEFAULT_FINANCIAL_PROFILE_CURRENCY
  assert(
    moneyCurrencies.every(value => value === currency),
    422,
    'all financial profile money must use the profile currency',
  )

  // Build UPDATE SET clause only for fields that were explicitly provided (not undefined).
  // This allows null to clear a field while omitting a key preserves the existing value.
  const updateParts = sql``
  if (input.credit_score_range !== undefined)
    updateParts.append(sql`, credit_score_range = ${input.credit_score_range}`)
  if (input.stated_income_range !== undefined) {
    updateParts.append(
      sql`, stated_income_minimum_minor_units = ${input.stated_income_range?.minimum.amount ?? null}`,
    )
    updateParts.append(
      sql`, stated_income_maximum_minor_units = ${input.stated_income_range?.maximum?.amount ?? null}`,
    )
  }
  if (input.total_credit_limit !== undefined)
    updateParts.append(
      sql`, total_credit_limit_minor_units = ${input.total_credit_limit?.amount ?? null}`,
    )
  if (input.currency !== undefined) updateParts.append(sql`, currency_code = ${input.currency}`)
  if (input.years_of_credit_history !== undefined)
    updateParts.append(sql`, years_of_credit_history = ${input.years_of_credit_history}`)
  if (input.hard_inquiries_12m !== undefined)
    updateParts.append(sql`, hard_inquiries_12m = ${input.hard_inquiries_12m}`)
  if (input.cards_opened_24m !== undefined)
    updateParts.append(sql`, cards_opened_24m = ${input.cards_opened_24m}`)

  const statement = sql`/* upsertUserFinancialProfile */
    INSERT INTO individual_financial_profiles (
      individual_id,
      credit_score_range,
      stated_income_minimum_minor_units,
      stated_income_maximum_minor_units,
      total_credit_limit_minor_units,
      currency_code,
      years_of_credit_history,
      hard_inquiries_12m,
      cards_opened_24m
    )
    VALUES (
      ${individualId},
      ${input.credit_score_range ?? null},
      ${input.stated_income_range?.minimum.amount ?? null},
      ${input.stated_income_range?.maximum?.amount ?? null},
      ${input.total_credit_limit?.amount ?? null},
      ${currency},
      ${input.years_of_credit_history ?? null},
      ${input.hard_inquiries_12m ?? null},
      ${input.cards_opened_24m ?? null}
    )
    ON CONFLICT (individual_id) DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP`
  statement.append(updateParts)
  statement.append(sql`
    RETURNING
      individual_id,
      credit_score_range,
      stated_income_minimum_minor_units::TEXT AS stated_income_minimum_minor_units,
      stated_income_maximum_minor_units::TEXT AS stated_income_maximum_minor_units,
      total_credit_limit_minor_units::TEXT AS total_credit_limit_minor_units,
      currency_code,
      years_of_credit_history,
      hard_inquiries_12m,
      cards_opened_24m,
      updated_at
  `)

  let rows: UserFinancialProfileRow[]
  try {
    ;({ rows } = await transactionQuery<UserFinancialProfileRow>(statement))
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23503') assert(false, 422, 'currency must be supported')
    if (pgError.code === '23514' || pgError.code === '22003') {
      assert(false, 422, 'financial profile money is outside the supported range')
    }
    throw error
  }
  const result = toUserFinancialProfile(rows[0]!)
  await transactionQuery.commit()
  return result
}
