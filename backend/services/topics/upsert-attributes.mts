import { write, type QueryOptions } from '@data-stores/psql'
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
    const query = topicAttributeUpsertQuery(tableName, '', '', 'topic_id = EXCLUDED.topic_id')
    const { rows } = await write<T>(query, [topicId], options)
    return rows[0] ?? null
  }

  // Build placeholders for INSERT values ($2, $3, ...)
  const insertPlaceholders = columns.map((_, i) => `$${i + 2}`).join(', ')

  // Build SET clause for UPDATE (col1 = $2, col2 = $3, ...)
  const updateSets = columns.map((col, i) => `${col} = $${i + 2}`).join(', ')

  // Build the upsert query
  const query = topicAttributeUpsertQuery(
    tableName,
    `, ${columns.join(', ')}`,
    `, ${insertPlaceholders}`,
    updateSets,
  )

  const { rows } = await write<T>(query, [topicId, ...values], options)
  return rows[0] ?? null
}

function topicAttributeUpsertQuery(
  tableName: TopicAttributeTableName,
  columns: string,
  values: string,
  updateSets: string,
): string {
  const suffix = `(topic_id${columns})
    VALUES ($1${values})
    ON CONFLICT (topic_id) DO UPDATE
    SET ${updateSets}
    RETURNING *`
  switch (tableName) {
    case 'card_topics':
      return `/* upsertTopicAttributes:cards */ INSERT INTO card_topics ${suffix}`
    case 'referral_program_topics':
      return `/* upsertTopicAttributes:referralPrograms */ INSERT INTO referral_program_topics ${suffix}`
    case 'retailer_topics':
      return `/* upsertTopicAttributes:retailers */ INSERT INTO retailer_topics ${suffix}`
    case 'rewards_program_status_topics':
      return `/* upsertTopicAttributes:rewardsProgramStatuses */ INSERT INTO rewards_program_status_topics ${suffix}`
    case 'rewards_program_topics':
      return `/* upsertTopicAttributes:rewardsPrograms */ INSERT INTO rewards_program_topics ${suffix}`
    case 'spending_category_topics':
      return `/* upsertTopicAttributes:spendingCategories */ INSERT INTO spending_category_topics ${suffix}`
  }
}
