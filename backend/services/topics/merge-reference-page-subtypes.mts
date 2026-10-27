import type { TransactionQuery } from '@data-stores/psql'
import { TOPIC_MERGE_SUBTYPE_TABLES } from './merge-reference-inventory.mts'

const subtypeColumns: Record<(typeof TOPIC_MERGE_SUBTYPE_TABLES)[number], string[]> = {
  card_topics: [
    'bank_topic_id',
    'brand_topic_id',
    'created_at',
    'updated_at',
    'annual_fee_minor_units',
    'currency_code',
  ],
  fediverse_instance_topics: [
    'software',
    'protocol',
    'nodeinfo_software_version',
    'total_users',
    'monthly_active_users',
    'is_open_for_registrations',
    'nodeinfo_raw',
    'integration_status',
    'created_at',
    'updated_at',
  ],
  referral_program_topics: [
    'company_topic_id',
    'enabled_at',
    'disabled_at',
    'created_at',
    'updated_at',
  ],
  retailer_topics: ['created_at', 'updated_at'],
  rewards_program_status_topics: ['lifetime_version_id', 'order_index', 'created_at', 'updated_at'],
  rewards_program_topics: ['company_topic_id', 'created_at', 'updated_at'],
  spending_category_topics: [
    'is_foreign_transaction',
    'default_spending_frequency',
    'created_at',
    'updated_at',
  ],
}

/** The destination subtype must exist before any subtype-FK child is repointed. */
export async function createTopicMergeDestinationSubtype(
  query: TransactionQuery,
  position: number,
  sourceId: string,
  destinationId: string,
): Promise<void> {
  const table = TOPIC_MERGE_SUBTYPE_TABLES[position]
  if (!table) return
  const fields = subtypeColumns[table]
  const names = ['topic_id', ...fields]
  const projection = names.map(name =>
    name === 'topic_id'
      ? '$2::uuid'
      : name === 'lifetime_version_id'
        ? 'CASE WHEN source.lifetime_version_id = $1::uuid THEN $2::uuid ELSE source.lifetime_version_id END'
        : `source.${name}`,
  )
  // The lifetime target has a unique incoming owner. Clear the source's outgoing edge only
  // when copying its attributes; all incoming children move in their separate bounded pass.
  const clearLifetime =
    table === 'rewards_program_status_topics'
      ? `, cleared AS (
    UPDATE rewards_program_status_topics SET lifetime_version_id = NULL WHERE topic_id = $1::uuid
      AND NOT EXISTS(SELECT 1 FROM rewards_program_status_topics WHERE topic_id = $2::uuid) RETURNING 1
  )`
      : ''
  await query(
    `/* createTopicMergeDestinationSubtype */ WITH source AS MATERIALIZED (
    SELECT * FROM ${table} WHERE topic_id = $1::uuid LIMIT 1
  ) ${clearLifetime} INSERT INTO ${table} (${names.join(', ')})
    SELECT ${projection.join(', ')} FROM source
    ${clearLifetime ? 'WHERE (SELECT count(*) FROM cleared) >= 0' : ''}
    ON CONFLICT (topic_id) DO NOTHING`,
    [sourceId, destinationId],
  )
}

export async function deleteTopicMergeSourceSubtype(
  query: TransactionQuery,
  position: number,
  sourceId: string,
): Promise<void> {
  const table = TOPIC_MERGE_SUBTYPE_TABLES[position]
  if (table)
    await query(
      `/* deleteTopicMergeSourceSubtype */ DELETE FROM ${table} WHERE topic_id = $1::uuid`,
      [sourceId],
    )
}
