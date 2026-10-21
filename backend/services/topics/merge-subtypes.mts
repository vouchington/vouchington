import type { TransactionQuery } from '@data-stores/psql'
import { TOPIC_MERGE_SUBTYPE_TABLES } from './merge-reference-inventory.mts'
import { buildReferenceMergeCtes } from './merge-reference-sql.mts'

export const subtypeReferences = [
  { table: 'topics', columns: ['referral_program_topic_id', 'rewards_program_topic_id'] },
  { table: 'hostname_crawler_configurations', columns: ['referral_program_topic_id'] },
  { table: 'individual_rewards_program_statuses', columns: ['rewards_program_status_topic_id'] },
  { table: 'spending_entries', columns: ['spending_category_topic_id'] },
  { table: 'retailer_countries', columns: ['retailer_topic_id'] },
  {
    table: 'referral_program_topic_link_validation_rule_sets',
    columns: ['referral_program_topic_id'],
  },
  { table: 'user_referral_program_links', columns: ['referral_program_topic_id'] },
  { table: 'individual_rewards_program_point_valuations', columns: ['rewards_program_topic_id'] },
] as const

/** Retain destination extensions, moving source-only facets without losing their attributes. */
export async function mergeTopicSubtypeReferences(
  query: TransactionQuery,
  sourceId: string,
  destinationId: string,
): Promise<void> {
  const references = buildReferenceMergeCtes(subtypeReferences)
  const dependencies = references
    .map((_, index) => `(SELECT count(*) FROM m${index}) >= 0`)
    .join(' AND ')
  const extensions = TOPIC_MERGE_SUBTYPE_TABLES.flatMap((table, index) => [
    `s${index}_move AS (
      UPDATE ${table} s SET topic_id = CASE WHEN s.topic_id = $1::uuid THEN $2::uuid ELSE s.topic_id END
        ${table === 'rewards_program_status_topics' ? ', lifetime_version_id = CASE WHEN s.lifetime_version_id = $1::uuid THEN $2::uuid ELSE s.lifetime_version_id END' : ''}
      WHERE (s.topic_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM ${table} d WHERE d.topic_id = $2::uuid))
        ${table === 'rewards_program_status_topics' ? 'OR (s.lifetime_version_id = $1::uuid AND s.topic_id <> $1::uuid)' : ''}
      RETURNING 1
    )`,
    `s${index}_delete AS (
      DELETE FROM ${table} s WHERE s.topic_id = $1::uuid
        AND EXISTS (SELECT 1 FROM ${table} d WHERE d.topic_id = $2::uuid)
        AND ${dependencies} RETURNING 1
    )`,
  ])
  await query(
    `/* mergeTopicSubtypeReferences */ WITH ${[...references, ...extensions].join(',\n')} SELECT 1`,
    [sourceId, destinationId],
  )
}
