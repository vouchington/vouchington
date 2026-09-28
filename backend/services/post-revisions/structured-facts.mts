import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { asBoolean, asDataPoint, asText, type DataPointRow } from './data-point-facts.mts'
type FieldChange = { before: unknown; after: unknown }

function textValue(data: DataPointRow, key: string): string | null {
  if (!data.has(key) || data.values[key] === null) return null
  return asText(data.values[key], key)
}

function numberValue(data: DataPointRow, key: string): number | null {
  if (!data.has(key) || data.values[key] === null) return null
  if (typeof data.values[key] !== 'number' || !Number.isFinite(data.values[key] as number)) {
    throw new Error(`Post revision structured_data.${key} must be a number or null`)
  }
  return data.values[key] as number
}

function boolValue(data: DataPointRow, key: string): boolean | null {
  if (!data.has(key) || data.values[key] === null) return null
  return asBoolean(data.values[key], key)
}

export async function insertStructuredData(
  revisionId: string,
  change: FieldChange | undefined,
  options: QueryOptions,
): Promise<void> {
  if (!change) return
  await insertStructuredSide(revisionId, 'before', change.before, options)
  await insertStructuredSide(revisionId, 'after', change.after, options)
}

async function insertStructuredSide(
  revisionId: string,
  side: 'before' | 'after',
  value: unknown,
  options: QueryOptions,
): Promise<void> {
  if (value === null) return
  const data = asDataPoint(value)
  await write(
    sql`/* createPostRevision:structuredData */
      INSERT INTO post_revision_data_points (
        revision_id, side, has_vertical, vertical, has_schema_version, schema_version,
        has_result, result, has_currency, currency, has_credit_score_range, credit_score_range,
        has_stated_income_range, stated_income_min_amount, stated_income_min_currency,
        stated_income_max_absent, stated_income_max_amount, stated_income_max_currency,
        has_existing_relationship, existing_relationship, has_hard_inquiries_12m, hard_inquiries_12m,
        has_cards_opened_24m, cards_opened_24m, has_credit_limit, credit_limit_amount, credit_limit_currency,
        has_total_credit_limit_all_cards, total_credit_limit_amount, total_credit_limit_currency,
        has_years_of_credit_history, years_of_credit_history, has_is_business_application, is_business_application,
        has_application_method, application_method, has_application_date, application_date,
        has_account_type, account_type, has_bonus_amount, bonus_amount, bonus_amount_currency,
        has_bonus_requirements, bonus_requirements, has_minimum_balance_requirement,
        minimum_balance_amount, minimum_balance_currency, has_direct_deposit_setup, direct_deposit_setup,
        has_topic_ids
      ) VALUES (
        ${revisionId}, ${side}, ${data.has('vertical')}, ${textValue(data, 'vertical')},
        ${data.has('schema_version')}, ${numberValue(data, 'schema_version')},
        ${data.has('result')}, ${textValue(data, 'result')},
        ${data.has('currency')}, ${textValue(data, 'currency')},
        ${data.has('credit_score_range')}, ${textValue(data, 'credit_score_range')},
        ${data.has('stated_income_range')}, ${data.incomeMinAmount}, ${data.incomeMinCurrency},
        ${data.incomeMaxAbsent}, ${data.incomeMaxAmount}, ${data.incomeMaxCurrency},
        ${data.has('existing_relationship')}, ${boolValue(data, 'existing_relationship')},
        ${data.has('hard_inquiries_12m')}, ${numberValue(data, 'hard_inquiries_12m')},
        ${data.has('cards_opened_24m')}, ${numberValue(data, 'cards_opened_24m')},
        ${data.has('credit_limit')}, ${data.creditLimitAmount}, ${data.creditLimitCurrency},
        ${data.has('total_credit_limit_all_cards')}, ${data.totalLimitAmount}, ${data.totalLimitCurrency},
        ${data.has('years_of_credit_history')}, ${numberValue(data, 'years_of_credit_history')},
        ${data.has('is_business_application')}, ${boolValue(data, 'is_business_application')},
        ${data.has('application_method')}, ${textValue(data, 'application_method')},
        ${data.has('application_date')}, ${textValue(data, 'application_date')},
        ${data.has('account_type')}, ${textValue(data, 'account_type')},
        ${data.has('bonus_amount')}, ${data.bonusAmount}, ${data.bonusCurrency},
        ${data.has('bonus_requirements')}, ${textValue(data, 'bonus_requirements')},
        ${data.has('minimum_balance_requirement')}, ${data.minimumAmount}, ${data.minimumCurrency},
        ${data.has('direct_deposit_setup')}, ${boolValue(data, 'direct_deposit_setup')},
        ${data.has('topic_ids')}
      )`,
    options,
  )
  if (data.topicIds.length === 0) return
  await write(
    sql`/* createPostRevision:structuredTopics */
      INSERT INTO post_revision_data_point_topics (revision_id, side, position, topic_id)
      SELECT ${revisionId}::uuid, ${side}, item.position, item.topic_id
      FROM UNNEST(${data.topicIds}::uuid[], ${data.topicIds.map((_, index) => index)}::integer[])
        AS item(topic_id, position)`,
    options,
  )
}
