import {
  beginTransaction,
  withTransactionOptions,
  write,
  type QueryOptions,
} from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { CurrencyCode } from '@ts-shared/money'
import type pg from 'pg'

type TopicAttributeAuditColumns = {
  topic_id: string
  created_at: Date
  updated_at: Date
}

type TopicAttributeColumnTypes = {
  card_topics: {
    bank_topic_id: string | null
    brand_topic_id: string | null
    annual_fee_minor_units: string | null
    currency_code: CurrencyCode | null
  }
  referral_program_topics: TopicAttributeAuditColumns & {
    company_topic_id: string | null
    enabled_at: Date | null
    disabled_at: Date | null
  }
  retailer_topics: TopicAttributeAuditColumns
  rewards_program_status_topics: TopicAttributeAuditColumns & {
    lifetime_version_id: string | null
    order_index: number
  }
  rewards_program_topics: TopicAttributeAuditColumns & {
    company_topic_id: string | null
  }
  spending_category_topics: TopicAttributeAuditColumns & {
    is_foreign_transaction: boolean
    default_spending_frequency: 'monthly' | 'annually'
  }
}

type TopicAttributeTableName = keyof TopicAttributeColumnTypes

const AUDIT_RETURNING_COLUMNS = ['topic_id', 'created_at', 'updated_at'] as const

const TOPIC_ATTRIBUTE_RETURNING_COLUMNS = {
  card_topics: ['bank_topic_id', 'brand_topic_id', 'annual_fee_minor_units', 'currency_code'],
  referral_program_topics: [
    ...AUDIT_RETURNING_COLUMNS,
    'company_topic_id',
    'enabled_at',
    'disabled_at',
  ],
  retailer_topics: [...AUDIT_RETURNING_COLUMNS],
  rewards_program_status_topics: [...AUDIT_RETURNING_COLUMNS, 'lifetime_version_id', 'order_index'],
  rewards_program_topics: [...AUDIT_RETURNING_COLUMNS, 'company_topic_id'],
  spending_category_topics: [
    ...AUDIT_RETURNING_COLUMNS,
    'is_foreign_transaction',
    'default_spending_frequency',
  ],
} as const satisfies {
  [K in TopicAttributeTableName]: readonly (keyof TopicAttributeColumnTypes[K])[]
}

export type TopicAttributeRowMap = {
  [K in TopicAttributeTableName]: {
    [
      C in Extract<
        (typeof TOPIC_ATTRIBUTE_RETURNING_COLUMNS)[K][number],
        keyof TopicAttributeColumnTypes[K]
      >
    ]: TopicAttributeColumnTypes[K][C]
  }
}

function buildReturningColumnsSql(tableName: TopicAttributeTableName): string {
  return TOPIC_ATTRIBUTE_RETURNING_COLUMNS[tableName]
    .map(column =>
      column === 'annual_fee_minor_units'
        ? 'annual_fee_minor_units::TEXT AS annual_fee_minor_units'
        : column,
    )
    .join(', ')
}

/** Upserts topic attributes into a subtype table and returns its closed returning column set. */
export async function upsertTopicAttributes<T extends TopicAttributeTableName>(
  tableName: T,
  topicId: string,
  columns: string[],
  values: unknown[],
  options?: QueryOptions,
): Promise<TopicAttributeRowMap[T] | null> {
  if (columns.length === 0) {
    // No-op conflict update ensures the row exists and RETURNING yields it.
    return writeTopicAttributeRow(
      options ?? {},
      tableName,
      '',
      '',
      'topic_id = EXCLUDED.topic_id',
      [topicId],
    )
  }

  const insertPlaceholders = columns.map((_, i) => `$${i + 2}`).join(', ')
  const updateSets = columns.map((col, i) => `${col} = $${i + 2}`).join(', ')
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
  const returningColumns = buildReturningColumnsSql(tableName)
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
