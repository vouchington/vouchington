import { write, type QueryOptions } from '@data-stores/psql'

type TopicAttributeTableName =
  | 'topics__cards'
  | 'topics__referral_programs'
  | 'topics__retailers'
  | 'topics__rewards_program_statuses'
  | 'topics__rewards_programs'
  | 'topics__spending_categories'

/**
 * Upserts topic attributes into a junction table using dynamic column building
 *
 * @param tableName - The table name (e.g., 'topics__cards')
 * @param topicId - The topic ID to upsert
 * @param columns - Array of column names to update
 * @param values - Array of values corresponding to the columns
 * @returns The upserted row or null if the operation fails
 */
export async function upsertTopicAttributes<T>(
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
    const { rows } = await write(query, [topicId], options)
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

  const { rows } = await write(query, [topicId, ...values], options)
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
    case 'topics__cards':
      return `/* upsertTopicAttributes:cards */ INSERT INTO topics__cards ${suffix}`
    case 'topics__referral_programs':
      return `/* upsertTopicAttributes:referralPrograms */ INSERT INTO topics__referral_programs ${suffix}`
    case 'topics__retailers':
      return `/* upsertTopicAttributes:retailers */ INSERT INTO topics__retailers ${suffix}`
    case 'topics__rewards_program_statuses':
      return `/* upsertTopicAttributes:rewardsProgramStatuses */ INSERT INTO topics__rewards_program_statuses ${suffix}`
    case 'topics__rewards_programs':
      return `/* upsertTopicAttributes:rewardsPrograms */ INSERT INTO topics__rewards_programs ${suffix}`
    case 'topics__spending_categories':
      return `/* upsertTopicAttributes:spendingCategories */ INSERT INTO topics__spending_categories ${suffix}`
  }
}
