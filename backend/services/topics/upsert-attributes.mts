import {
  beginTransaction,
  withTransactionOptions,
  write,
  type QueryOptions,
} from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { CurrencyCode } from '@ts-shared/money'
import type pg from 'pg'

export type TopicAttributeRowMap = {
  card_topics: {
    bank_topic_id: string | null
    brand_topic_id: string | null
    annual_fee_minor_units: string | null
    currency_code: CurrencyCode | null
  }
  referral_program_topics: {
    topic_id: string
    company_topic_id: string | null
    enabled_at: Date | null
    disabled_at: Date | null
    created_at: Date
    updated_at: Date
  }
  retailer_topics: {
    topic_id: string
    created_at: Date
    updated_at: Date
  }
  rewards_program_status_topics: {
    topic_id: string
    lifetime_version_id: string | null
    order_index: number
    created_at: Date
    updated_at: Date
  }
  rewards_program_topics: {
    topic_id: string
    company_topic_id: string | null
    created_at: Date
    updated_at: Date
  }
  spending_category_topics: {
    topic_id: string
    is_foreign_transaction: boolean
    default_spending_frequency: 'monthly' | 'annually'
    created_at: Date
    updated_at: Date
  }
}

type TopicAttributeTableName = keyof TopicAttributeRowMap

const TOPIC_ATTRIBUTE_RETURNING_COLUMNS: Record<TopicAttributeTableName, string> = {
  card_topics:
    'bank_topic_id, brand_topic_id, annual_fee_minor_units::TEXT AS annual_fee_minor_units, currency_code',
  referral_program_topics:
    'topic_id, company_topic_id, enabled_at, disabled_at, created_at, updated_at',
  retailer_topics: 'topic_id, created_at, updated_at',
  rewards_program_status_topics:
    'topic_id, lifetime_version_id, order_index, created_at, updated_at',
  rewards_program_topics: 'topic_id, company_topic_id, created_at, updated_at',
  spending_category_topics:
    'topic_id, is_foreign_transaction, default_spending_frequency, created_at, updated_at',
}

/**
 * Upserts topic attributes into a junction table using dynamic column building
 *
 * @param tableName - The table name (e.g., 'card_topics')
 * @param topicId - The topic ID to upsert
 * @param columns - Array of column names to update
 * @param values - Array of values corresponding to the columns
 * @returns The upserted row or null if the operation fails
 */
export async function upsertTopicAttributes<T extends TopicAttributeTableName>(
  tableName: T,
  topicId: string,
  columns: string[],
  values: unknown[],
  options?: QueryOptions,
): Promise<TopicAttributeRowMap[T] | null> {
  if (columns.length === 0) {
    // No columns to update, but we still want to ensure the row exists
    // Use a no-op update on conflict so RETURNING always yields a row.
    return writeTopicAttributeRow(
      options ?? {},
      tableName,
      '',
      '',
      'topic_id = EXCLUDED.topic_id',
      [topicId],
    )
  }

  // Build placeholders for INSERT values ($2, $3, ...)
  const insertPlaceholders = columns.map((_, i) => `$${i + 2}`).join(', ')

  // Build SET clause for UPDATE (col1 = $2, col2 = $3, ...)
  const updateSets = columns.map((col, i) => `${col} = $${i + 2}`).join(', ')

  // Build the upsert query
  return writeTopicAttributeRow(
    options ?? {},
    tableName,
    `, ${columns.join(', ')}`,
    `, ${insertPlaceholders}`,
    updateSets,
    [topicId, ...values],
  )
}

async function writeTopicAttributeRow<T extends TopicAttributeTableName>(
  options: QueryOptions,
  tableName: T,
  columns: string,
  values: string,
  updateSets: string,
  parameters: unknown[],
): Promise<TopicAttributeRowMap[T] | null> {
  const returningColumns = TOPIC_ATTRIBUTE_RETURNING_COLUMNS[tableName]
  const suffix = `(topic_id${columns})
    VALUES ($1${values})
    ON CONFLICT (topic_id) DO UPDATE
    SET ${updateSets}
    RETURNING ${returningColumns}`
  const run = async (query: TransactionQuery) => {
    const { rows } = await topicAttributeUpsertQuery<TopicAttributeRowMap[T]>(
      query,
      tableName,
      suffix,
      parameters,
    )
    return rows[0] ?? null
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using query = await beginTransaction()
  const row = await run(query)
  await query.commit()
  return row
}

function topicAttributeUpsertQuery<T extends pg.QueryResultRow>(
  query: TransactionQuery,
  tableName: TopicAttributeTableName,
  suffix: string,
  parameters: unknown[],
): Promise<pg.QueryResult<T>> {
  switch (tableName) {
    case 'card_topics':
      return write<T>(
        `/* upsertTopicAttributes:cards */ INSERT INTO card_topics ${suffix}`,
        parameters,
        { query },
      )
    case 'referral_program_topics':
      return write<T>(
        `/* upsertTopicAttributes:referralPrograms */ INSERT INTO referral_program_topics ${suffix}`,
        parameters,
        { query },
      )
    case 'retailer_topics':
      return write<T>(
        `/* upsertTopicAttributes:retailers */ INSERT INTO retailer_topics ${suffix}`,
        parameters,
        { query },
      )
    case 'rewards_program_status_topics':
      return write<T>(
        `/* upsertTopicAttributes:rewardsProgramStatuses */ INSERT INTO rewards_program_status_topics ${suffix}`,
        parameters,
        { query },
      )
    case 'rewards_program_topics':
      return write<T>(
        `/* upsertTopicAttributes:rewardsPrograms */ INSERT INTO rewards_program_topics ${suffix}`,
        parameters,
        { query },
      )
    case 'spending_category_topics':
      return write<T>(
        `/* upsertTopicAttributes:spendingCategories */ INSERT INTO spending_category_topics ${suffix}`,
        parameters,
        { query },
      )
  }
}
