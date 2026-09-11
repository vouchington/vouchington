import { write } from '@data-stores/psql'
import { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/backfill-categories-for-topic-aliases'
import { clearAllCategoriesForUnlinkedTopicAlias } from '@services/rss-feed-items/clear-all-unlinked-topic-alias-categories'
import { backfillCategoriesForTopicAlias } from './categories.mts'
import sql, { type SQLStatement } from 'sql-template-strings'

export const TOPIC_ALIAS_CATEGORY_MAPPING_RECONCILIATION_BATCH_SIZE = 25

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
export async function processReconcileTopicAliasCategoryMappings(): Promise<{
  reconciled: number
  updated: number
}> {
  const candidates = await getTopicAliasCategoryMappingDirtyRows()
  const { errors, ...result } = await reconcileTopicAliasCategoryMappingDirtyRows(
    candidates,
    0,
    0,
    [],
  )
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Topic alias category mapping reconciliation failed')
  }
  return result
}

async function getTopicAliasCategoryMappingDirtyRows(): Promise<
  TopicAliasCategoryMappingDirtyRow[]
> {
  const { rows } = await write<TopicAliasCategoryMappingDirtyRow>(
    buildTopicAliasCategoryMappingDirtyRowsQuery(),
  )
  return rows
}

export function buildTopicAliasCategoryMappingDirtyRowsQuery(
  limit = TOPIC_ALIAS_CATEGORY_MAPPING_RECONCILIATION_BATCH_SIZE,
): SQLStatement {
  return sql`/* getTopicAliasCategoryMappingDirtyRows */
    SELECT topic_alias_id, alias, generation
    FROM topic_alias_category_mapping_reconciliations
    ORDER BY updated_at, topic_alias_id
    LIMIT ${limit}`
}

async function reconcileTopicAliasCategoryMappingDirtyRows(
  candidates: TopicAliasCategoryMappingDirtyRow[],
  reconciled: number,
  updated: number,
  errors: unknown[],
): Promise<{ reconciled: number; updated: number; errors: unknown[] }> {
  const [candidate, ...remaining] = candidates
  if (!candidate) return { reconciled, updated, errors }
  try {
    const result = await reconcileTopicAliasCategoryMappingDirtyRow(candidate)
    return reconcileTopicAliasCategoryMappingDirtyRows(
      remaining,
      reconciled + 1,
      updated + result.updated,
      errors,
    )
  } catch (error) {
    errors.push(error)
  }
  return reconcileTopicAliasCategoryMappingDirtyRows(remaining, reconciled, updated, errors)
}

async function reconcileTopicAliasCategoryMappingDirtyRow(
  candidate: TopicAliasCategoryMappingDirtyRow,
): Promise<{ updated: number }> {
  const currentAlias = await getCurrentTopicAlias(candidate.topic_alias_id)
  const updated = currentAlias?.topic_id
    ? await backfillLinkedTopicAliasCategories(currentAlias.topic_id)
    : await clearAllCategoriesForUnlinkedTopicAlias(candidate.topic_alias_id, candidate.alias)
  await acknowledgeTopicAliasCategoryMappingDirtyRow(candidate)
  return updated
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

async function backfillLinkedTopicAliasCategories(topicId: string): Promise<{ updated: number }> {
  const [itemBackfill, feedBackfill] = await Promise.all([
    backfillCategoriesForTopicAliases(topicId),
    backfillCategoriesForTopicAlias(topicId),
  ])
  return { updated: itemBackfill.updated + feedBackfill }
}

async function acknowledgeTopicAliasCategoryMappingDirtyRow(
  candidate: TopicAliasCategoryMappingDirtyRow,
): Promise<void> {
  await write(
    `/* acknowledgeTopicAliasCategoryMappingDirtyRow */
      DELETE FROM topic_alias_category_mapping_reconciliations
      WHERE topic_alias_id = $1
        AND generation = $2`,
    [candidate.topic_alias_id, candidate.generation],
  )
}
