import { write } from '@data-stores/psql'
import { getRssFeedsWorkLimit } from './work-limits.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { AliasCategoryCursor } from './topic-alias-category-raw-page.mts'

export type TopicAliasCategoryMappingDirtyRow = AliasCategoryCursor & {
  topic_alias_id: string
  alias: string
  generation: string
}

export type CurrentTopicAlias = { topic_id: string | null }

export async function getTopicAliasCategoryMappingDirtyRows(
  limit: number,
  topicAliasIds?: readonly string[],
): Promise<TopicAliasCategoryMappingDirtyRow[]> {
  const { rows } = await write<TopicAliasCategoryMappingDirtyRow>(
    buildTopicAliasCategoryMappingDirtyRowsQuery(limit, topicAliasIds),
  )
  return rows
}

function buildTopicAliasCategoryMappingDirtyRowsQuery(
  limit = getRssFeedsWorkLimit('topic_alias_category_mapping_reconciliation_batch_size'),
  topicAliasIds?: readonly string[],
): SQLStatement {
  if (!topicAliasIds) {
    return sql`/* getTopicAliasCategoryMappingDirtyRows */
    SELECT reconciliation.topic_alias_id, reconciliation.alias, reconciliation.generation,
      reconciliation.phase, reconciliation.scan_upper_item_id,
      reconciliation.scan_upper_feed_id, reconciliation.after_item_id,
      reconciliation.after_category_identity_id, reconciliation.after_feed_id
    FROM topic_alias_category_mapping_reconciliations reconciliation
    WHERE reconciliation.unlink_requested_at IS NULL
    ORDER BY reconciliation.updated_at, reconciliation.topic_alias_id
    LIMIT ${limit}`
  }
  return sql`/* getTopicAliasCategoryMappingDirtyRows */
    SELECT reconciliation.topic_alias_id, reconciliation.alias, reconciliation.generation,
      reconciliation.phase, reconciliation.scan_upper_item_id,
      reconciliation.scan_upper_feed_id, reconciliation.after_item_id,
      reconciliation.after_category_identity_id, reconciliation.after_feed_id
    FROM topic_alias_category_mapping_reconciliations reconciliation
    WHERE reconciliation.topic_alias_id = ANY(${topicAliasIds}::uuid[])
      AND reconciliation.unlink_requested_at IS NULL
    ORDER BY reconciliation.updated_at, reconciliation.topic_alias_id
    LIMIT ${limit}`
}

export async function checkpointTopicAliasCategoryMappingDirtyRow(
  candidate: TopicAliasCategoryMappingDirtyRow,
  cursor: AliasCategoryCursor,
): Promise<boolean> {
  const { rowCount } = await write(
    `/* checkpointTopicAliasCategoryMappingDirtyRow */
     UPDATE topic_alias_category_mapping_reconciliations
     SET phase = $3::smallint, scan_upper_item_id = $4::uuid,
       scan_upper_feed_id = $5::uuid, after_item_id = $6::uuid,
       after_category_identity_id = $7::uuid, after_feed_id = $8::uuid
     WHERE topic_alias_id = $1::uuid AND generation = $2::bigint
       AND phase = $9::smallint
       AND after_item_id IS NOT DISTINCT FROM $10::uuid
       AND after_category_identity_id IS NOT DISTINCT FROM $11::uuid
       AND after_feed_id IS NOT DISTINCT FROM $12::uuid`,
    [
      candidate.topic_alias_id,
      candidate.generation,
      cursor.phase,
      cursor.scan_upper_item_id,
      cursor.scan_upper_feed_id,
      cursor.after_item_id,
      cursor.after_category_identity_id,
      cursor.after_feed_id,
      candidate.phase,
      candidate.after_item_id,
      candidate.after_category_identity_id,
      candidate.after_feed_id,
    ],
  )
  return rowCount === 1
}

export async function getCurrentTopicAlias(
  topicAliasId: string,
): Promise<CurrentTopicAlias | undefined> {
  const { rows } = await write<CurrentTopicAlias>(
    `/* getCurrentTopicAlias */
      SELECT topic_id
      FROM topic_aliases
      WHERE id = $1`,
    [topicAliasId],
  )
  return rows[0]
}

export async function acknowledgeTopicAliasCategoryMappingDirtyRow(
  candidate: TopicAliasCategoryMappingDirtyRow,
): Promise<boolean> {
  const { rowCount } = await write(
    `/* acknowledgeTopicAliasCategoryMappingDirtyRow */
      DELETE FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = $1
        AND generation = $2
        AND phase = $3::smallint
        AND after_item_id IS NOT DISTINCT FROM $4::uuid
        AND after_category_identity_id IS NOT DISTINCT FROM $5::uuid
        AND after_feed_id IS NOT DISTINCT FROM $6::uuid`,
    [
      candidate.topic_alias_id,
      candidate.generation,
      candidate.phase,
      candidate.after_item_id,
      candidate.after_category_identity_id,
      candidate.after_feed_id,
    ],
  )
  return rowCount === 1
}
