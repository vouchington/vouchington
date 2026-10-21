import { getRssFeedsWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/backfill-categories-for-topic-aliases'
import { clearAllCategoriesForUnlinkedTopicAlias } from '@services/rss-feed-items/clear-all-unlinked-topic-alias-categories'
import { backfillCategoriesForTopicAlias } from './categories.mts'
import sql, { type SQLStatement } from 'sql-template-strings'

type TopicAliasCategoryMappingDirtyRow = {
  topic_alias_id: string
  alias: string
  generation: string
}

type CurrentTopicAlias = { topic_id: string | null }

/**
 * Drains durable alias transitions, rather than scanning category tables. A successful exact-
 * generation acknowledgement deletes the row; a newer transition wins the compare-and-delete and
 * remains pending for the next serialized job.
 */
export async function processReconcileTopicAliasCategoryMappings(
  limit = getRssFeedsWorkLimit('topic_alias_category_mapping_reconciliation_batch_size'),
  topicAliasIds?: readonly string[],
): Promise<{
  reconciled: number
  updated: number
  hasMore: boolean
}> {
  if (topicAliasIds?.length === 0) return { reconciled: 0, updated: 0, hasMore: false }
  const candidates = await getTopicAliasCategoryMappingDirtyRows(limit, topicAliasIds)
  const { errors, ...result } = await reconcileTopicAliasCategoryMappingDirtyRows(
    candidates,
    0,
    0,
    [],
    candidates.length === limit,
  )
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Topic alias category mapping reconciliation failed')
  }
  return result
}

async function getTopicAliasCategoryMappingDirtyRows(
  limit: number,
  topicAliasIds?: readonly string[],
): Promise<TopicAliasCategoryMappingDirtyRow[]> {
  const { rows } = await write<TopicAliasCategoryMappingDirtyRow>(
    buildTopicAliasCategoryMappingDirtyRowsQuery(limit, topicAliasIds),
  )
  return rows
}

export function buildTopicAliasCategoryMappingDirtyRowsQuery(
  limit = getRssFeedsWorkLimit('topic_alias_category_mapping_reconciliation_batch_size'),
  topicAliasIds?: readonly string[],
): SQLStatement {
  if (!topicAliasIds) {
    return sql`/* getTopicAliasCategoryMappingDirtyRows */
    SELECT topic_alias_id, alias, generation
    FROM topic_alias_category_mapping_reconciliations
    ORDER BY updated_at, topic_alias_id
    LIMIT ${limit}`
  }
  return sql`/* getTopicAliasCategoryMappingDirtyRows */
    SELECT topic_alias_id, alias, generation
    FROM topic_alias_category_mapping_reconciliations
    WHERE topic_alias_id = ANY(${topicAliasIds}::uuid[])
    ORDER BY updated_at, topic_alias_id
    LIMIT ${limit}`
}

async function reconcileTopicAliasCategoryMappingDirtyRows(
  candidates: TopicAliasCategoryMappingDirtyRow[],
  reconciled: number,
  updated: number,
  errors: unknown[],
  hasMore: boolean,
): Promise<{ reconciled: number; updated: number; errors: unknown[]; hasMore: boolean }> {
  const [candidate, ...remaining] = candidates
  if (!candidate) return { reconciled, updated, errors, hasMore }
  try {
    const result = await reconcileTopicAliasCategoryMappingDirtyRow(candidate)
    return await reconcileTopicAliasCategoryMappingDirtyRows(
      remaining,
      reconciled + (result.hasMore ? 0 : 1),
      updated + result.updated,
      errors,
      hasMore || result.hasMore,
    )
  } catch (err) {
    errors.push(err)
  }
  return reconcileTopicAliasCategoryMappingDirtyRows(
    remaining,
    reconciled,
    updated,
    errors,
    hasMore,
  )
}

async function reconcileTopicAliasCategoryMappingDirtyRow(
  candidate: TopicAliasCategoryMappingDirtyRow,
): Promise<{ updated: number; hasMore: boolean }> {
  const currentAlias = await getCurrentTopicAlias(candidate.topic_alias_id)
  const updated = currentAlias?.topic_id
    ? await backfillLinkedTopicAliasCategories(currentAlias.topic_id)
    : await clearAllCategoriesForUnlinkedTopicAlias(candidate.topic_alias_id, candidate.alias)
  if (updated.hasMore) return updated
  const acknowledged = await acknowledgeTopicAliasCategoryMappingDirtyRow(candidate)
  return { ...updated, hasMore: !acknowledged }
}

async function getCurrentTopicAlias(topicAliasId: string): Promise<CurrentTopicAlias | undefined> {
  const { rows } = await write<CurrentTopicAlias>(
    `/* getCurrentTopicAlias */
      SELECT topic_id
      FROM topic_aliases
      WHERE id = $1`,
    [topicAliasId],
  )
  return rows[0]
}

async function backfillLinkedTopicAliasCategories(
  topicId: string,
): Promise<{ updated: number; hasMore: boolean }> {
  const [itemBackfill, feedBackfill] = await Promise.all([
    backfillCategoriesForTopicAliases(topicId),
    backfillCategoriesForTopicAlias(topicId),
  ])
  return {
    updated: itemBackfill.updated + feedBackfill.updated,
    hasMore: itemBackfill.hasMore || feedBackfill.hasMore,
  }
}

async function acknowledgeTopicAliasCategoryMappingDirtyRow(
  candidate: TopicAliasCategoryMappingDirtyRow,
): Promise<boolean> {
  const { rowCount } = await write(
    `/* acknowledgeTopicAliasCategoryMappingDirtyRow */
      DELETE FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = $1
        AND generation = $2`,
    [candidate.topic_alias_id, candidate.generation],
  )
  return rowCount === 1
}
