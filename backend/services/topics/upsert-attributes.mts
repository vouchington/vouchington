import {
  beginTransaction,
  withTransactionOptions,
  write,
  type QueryOptions,
} from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type pg from 'pg'

type TopicAttributeTableName =
  | 'card_topics'
  | 'referral_program_topics'
  | 'retailer_topics'
  | 'rewards_program_status_topics'
  | 'rewards_program_topics'
  | 'spending_category_topics'

/**
 * Upserts topic attributes into a junction table using dynamic column building
 *
 * @param tableName - The table name (e.g., 'card_topics')
 * @param topicId - The topic ID to upsert
 * @param columns - Array of column names to update
 * @param values - Array of values corresponding to the columns
 * @returns The upserted row or null if the operation fails
 */
export async function upsertTopicAttributes<T extends pg.QueryResultRow>(
  tableName: TopicAttributeTableName,
  topicId: string,
  columns: string[],
  values: unknown[],
  options?: QueryOptions,
): Promise<T | null> {
  if (columns.length === 0) {
    // No columns to update, but we still want to ensure the row exists
    // Use a no-op update on conflict so RETURNING always yields a row.
    return writeTopicAttributeRow<T>(
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
  return writeTopicAttributeRow<T>(
    options ?? {},
    tableName,
    `, ${columns.join(', ')}`,
    `, ${insertPlaceholders}`,
    updateSets,
    [topicId, ...values],
  )
}

async function writeTopicAttributeRow<T extends pg.QueryResultRow>(
  options: QueryOptions,
  tableName: TopicAttributeTableName,
  columns: string,
  values: string,
  updateSets: string,
  parameters: unknown[],
): Promise<T | null> {
  const suffix = `(topic_id${columns})
    VALUES ($1${values})
    ON CONFLICT (topic_id) DO UPDATE
    SET ${updateSets}
    RETURNING *`
  const run = async (query: TransactionQuery) => {
    const { rows } = await topicAttributeUpsertQuery<T>(query, tableName, suffix, parameters)
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
