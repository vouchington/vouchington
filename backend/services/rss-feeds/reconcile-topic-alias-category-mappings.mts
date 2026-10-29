import { getRssFeedsWorkLimit } from './work-limits.mts'
import { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/backfill-categories-for-topic-aliases'
import { clearUnlinkedTopicAliasItemPage } from '@services/rss-feed-items/clear-unlinked-topic-alias-categories'
import { clearUnlinkedTopicAliasFeedPage } from '@services/rss-feed-items/clear-unlinked-topic-alias-feed-categories'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { beginTransaction } from '@data-stores/psql'
import {
  getTopicAliasCategoryMappingDirtyRows,
  checkpointTopicAliasCategoryMappingDirtyRow,
  acknowledgeTopicAliasCategoryMappingDirtyRow,
  getCurrentTopicAlias,
  type TopicAliasCategoryMappingDirtyRow,
  type CurrentTopicAlias,
} from './topic-alias-category-dirty-state.mts'

import {
  readAliasCategoryRawPage,
  type AliasCategoryRawPage,
} from './topic-alias-category-raw-page.mts'
import { backfillLinkedAliasFeedPage } from './linked-alias-feed-page.mts'

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
  await using transaction = await beginTransaction()
  const page = await readAliasCategoryRawPage(
    transaction,
    candidate.topic_alias_id,
    candidate.alias,
    candidate,
    candidate.phase === 2
      ? currentAlias?.topic_id
        ? getRssFeedsWorkLimit('category_backfill_batch_size')
        : getRssFeedItemsWorkLimit('category_clear_batch_size')
      : getRssFeedItemsWorkLimit(
          currentAlias?.topic_id ? 'category_backfill_batch_size' : 'category_clear_batch_size',
        ),
  )
  await transaction.commit()
  const updated = await applyAliasCategoryRawPage(candidate, currentAlias, page)
  if (page.hasMore) {
    const checkpointed = await checkpointTopicAliasCategoryMappingDirtyRow(candidate, page.cursor)
    return { updated, hasMore: page.hasMore || !checkpointed }
  }
  const acknowledged = await acknowledgeTopicAliasCategoryMappingDirtyRow(candidate)
  return { updated, hasMore: !acknowledged }
}

async function applyAliasCategoryRawPage(
  candidate: TopicAliasCategoryMappingDirtyRow,
  currentAlias: CurrentTopicAlias | undefined,
  page: AliasCategoryRawPage,
): Promise<number> {
  if (page.rows.length === 0) return 0
  if (candidate.phase === 2) {
    const feeds = page.rows.flatMap(row =>
      row.rss_feed_id
        ? [{ rss_feed_id: row.rss_feed_id, category_identity_id: row.category_identity_id }]
        : [],
    )
    if (currentAlias?.topic_id)
      return backfillLinkedAliasFeedPage(
        candidate.topic_alias_id,
        candidate.alias,
        currentAlias.topic_id,
        feeds,
      )
    await using transaction = await beginTransaction()
    const updated = await clearUnlinkedTopicAliasFeedPage(
      transaction,
      candidate.topic_alias_id,
      candidate.alias,
      feeds,
    )
    await transaction.commit()
    return updated
  }
  const items = page.rows.flatMap(row =>
    row.rss_feed_item_id
      ? [{ rss_feed_item_id: row.rss_feed_item_id, category_identity_id: row.category_identity_id }]
      : [],
  )
  if (currentAlias?.topic_id) {
    const result = await backfillCategoriesForTopicAliases(currentAlias.topic_id, {
      rows: items,
      hasMore: page.hasMore,
      match: {
        kind: candidate.phase === 0 ? 'alias_id' : 'alias_text',
        aliasId: candidate.topic_alias_id,
        alias: candidate.alias,
      },
    })
    return result.updated
  }
  const result = await clearUnlinkedTopicAliasItemPage(candidate.topic_alias_id, candidate.alias, {
    rows: items,
    hasMore: page.hasMore,
    match: candidate.phase === 0 ? 'alias_id' : 'alias_text',
  })
  return result.updated
}
