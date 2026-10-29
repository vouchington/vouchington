import { beginTransaction, read, write } from '@data-stores/psql'
import { processReconcileTopicAliasCategoryMappings } from '../../services/rss-feeds/reconcile-topic-alias-category-mappings.mts'
import { backfillTopicTextItemPage } from '../../services/rss-feeds/topic-text-category-backfill.mts'
import { readAliasCategoryRawPage } from '../../services/rss-feeds/topic-alias-category-raw-page.mts'
import { getRssFeedItemsWorkLimit } from '../../services/rss-feed-items/work-limits.mts'
export type TopicAliasCategoryMappingDirtyRowForTest = {
  alias: string
  generation: string
  topic_alias_id: string
}
export async function createTestTopicAliasForCategoryMapping({
  alias,
  topicId = null,
}: {
  alias: string
  topicId?: string | null
}): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* createTestTopicAliasForCategoryMapping */
      INSERT INTO topic_aliases (topic_id, alias)
      VALUES ($1, $2)
      RETURNING id`,
    [topicId, alias],
  )
  return rows[0]!.id
}
export async function updateTestTopicAliasCategoryMappingOwner(
  topicAliasId: string,
  topicId: string | null,
): Promise<void> {
  await write(
    `/* updateTestTopicAliasCategoryMappingOwner */
      UPDATE topic_aliases
      SET topic_id = $1
      WHERE id = $2`,
    [topicId, topicAliasId],
  )
}
export async function setTestTopicAliasUnlinkPending(
  topicAliasId: string,
  topicId: string,
): Promise<void> {
  await write(
    `/* setTestTopicAliasUnlinkPending */
      UPDATE topic_aliases
      SET topic_id = NULL,
          unlink_topic_id = $2,
          unlink_requested_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [topicAliasId, topicId],
  )
}
export async function deleteTestTopicAliasForCategoryMapping(topicAliasId: string): Promise<void> {
  await write(
    `/* deleteTestTopicAliasForCategoryMapping */
      DELETE FROM topic_aliases
      WHERE id = $1`,
    [topicAliasId],
  )
}
export async function getTopicAliasCategoryMappingDirtyRowForTest(
  topicAliasId: string,
): Promise<TopicAliasCategoryMappingDirtyRowForTest | undefined> {
  const { rows } = await read<TopicAliasCategoryMappingDirtyRowForTest>(
    `/* getTopicAliasCategoryMappingDirtyRowForTest */
      SELECT topic_alias_id, alias, generation
      FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = $1`,
    [topicAliasId],
  )
  return rows[0]
}

export async function acknowledgeTopicAliasCategoryMappingDirtyRowForTest(
  topicAliasId: string,
  generation: string,
): Promise<void> {
  await write(
    `/* acknowledgeTopicAliasCategoryMappingDirtyRowForTest */
      DELETE FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = $1
        AND generation = $2`,
    [topicAliasId, generation],
  )
}

export async function deleteTopicAliasCategoryMappingDirtyRowsForTest(
  topicAliasIds: string[],
): Promise<void> {
  if (topicAliasIds.length === 0) return
  await write(
    `/* deleteTopicAliasCategoryMappingDirtyRowsForTest */
      DELETE FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = ANY($1::uuid[])`,
    [topicAliasIds],
  )
}

export async function createTopicAliasCategoryMappingDirtyRowsForTest(
  rows: Array<{ alias: string; topicAliasId: string }>,
): Promise<void> {
  if (rows.length === 0) return
  await write(
    `/* createTopicAliasCategoryMappingDirtyRowsForTest */
      INSERT INTO topic_alias_category_mapping_reconciliations (topic_alias_id, alias)
      SELECT topic_alias_id, alias
      FROM UNNEST($1::uuid[], $2::text[]) AS input(topic_alias_id, alias)`,
    [rows.map(row => row.topicAliasId), rows.map(row => row.alias)],
  )
}

export async function countTopicAliasCategoryMappingDirtyRowsForTest(
  topicAliasIds: string[],
): Promise<number> {
  if (topicAliasIds.length === 0) return 0
  const { rows } = await read<{ count: string }>(
    `/* countTopicAliasCategoryMappingDirtyRowsForTest */
      SELECT COUNT(*)::text AS count
      FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = ANY($1::uuid[])`,
    [topicAliasIds],
  )
  return Number(rows[0]?.count ?? 0)
}

/** Drives the current bounded producers to completion for an isolated test topic. */
export async function backfillTopicCategoryMappingsForTest(
  topicId: string,
): Promise<{ updated: number; hasMore: false }> {
  const { rows: aliases } = await read<{ id: string }>(
    `/* backfillTopicCategoryMappingsForTest aliases */
     SELECT id FROM topic_aliases WHERE topic_id = $1::uuid ORDER BY alias LIMIT 20`,
    [topicId],
  )
  let updated = 0
  for (const alias of aliases) {
    let complete = false
    for (let page = 0; page < 20; page += 1) {
      const result = await processReconcileTopicAliasCategoryMappings(1, [alias.id])
      updated += result.updated
      if (!result.hasMore) {
        complete = true
        break
      }
    }
    if (!complete) throw new Error('Test alias reconciliation exceeded 20 pages')
  }
  let cursor: Awaited<ReturnType<typeof backfillTopicTextItemPage>>['cursor'] = null
  for (let page = 0; page < 20; page += 1) {
    const result = await backfillTopicTextItemPage(topicId, cursor)
    updated += result.updated
    if (!result.hasMore) return { updated, hasMore: false }
    cursor = result.cursor
  }
  throw new Error('Test topic text backfill exceeded 20 pages')
}

export async function readAliasBackfillRawPageForTest(aliasId: string, alias: string) {
  await using transaction = await beginTransaction()
  const page = await readAliasCategoryRawPage(
    transaction,
    aliasId,
    alias,
    {
      phase: 1,
      scan_upper_item_id: null,
      scan_upper_feed_id: null,
      after_item_id: null,
      after_category_identity_id: null,
      after_feed_id: null,
    },
    getRssFeedItemsWorkLimit('category_backfill_batch_size'),
  )
  await transaction.commit()
  return {
    rows: page.rows.flatMap(row =>
      row.rss_feed_item_id
        ? [
            {
              rss_feed_item_id: row.rss_feed_item_id,
              category_identity_id: row.category_identity_id,
            },
          ]
        : [],
    ),
    hasMore: page.cursor.phase === 1,
    match: { kind: 'alias_text' as const, aliasId, alias },
  }
}

export async function drainTopicAliasCategoryMappingForTest(aliasId: string): Promise<number> {
  let updated = 0
  for (let page = 0; page < 20; page += 1) {
    const result = await processReconcileTopicAliasCategoryMappings(1, [aliasId])
    updated += result.updated
    if (!result.hasMore) return updated
  }
  throw new Error('Test alias category generation exceeded twenty pages')
}
