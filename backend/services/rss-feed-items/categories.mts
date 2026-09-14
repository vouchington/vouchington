/* oxlint-disable max-lines -- category upsert retains its staged read, ordered mutation, and post-commit reconciliation boundary together. */
import { read, beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { chunkArray } from './processing-limits.mts'
import {
  buildRssFeedItemCategorySqlBatches,
  normalizeRssFeedItemCategorySnapshots,
} from './category-batches.mts'
import { readCategoryDataChunk } from './category-data.mts'
import {
  insertMissingCategories,
  insertMissingHashtagAliases,
  updateMatchedCategories,
  type CategoryTopicMutation,
} from './categories-chunks.mts'
import { createCategoryRelations } from './category-relations.mts'
import { reconcileRssFeedItemCategorySnapshots } from './reconcile-categories.mts'
import { invalidateRssFeedItemsAndWaitForPurge } from '@services/entity-cache/invalidate-rss-feed-items'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { normalizeHashtag } from '@ts-shared/utils'
import { withRssFeedItemCategorySnapshotLocks } from './category-snapshot-lock.mts'
import {
  lockRssFeedItemsForStoryPublicationChanges,
  recordStoryPublicationChangesForCategoryTopics,
} from './story-publication-change.mts'
import {
  lockTopicAliasPublicationScopes,
  recordTopicAliasPublicationWork,
} from '@services/post-publication'
export { getRssFeedItemMappedTopics } from './category-relations.mts'
export { buildRssFeedItemCategorySqlBatches } from './category-batches.mts'
export { clearCategoriesForUnlinkedTopicAlias } from './clear-topic-alias-categories.mts'
export { backfillCategoriesForTopicAliases } from './backfill-categories-for-topic-aliases.mts'

// Keeps per-call Valkey work below the client in-flight ceiling during large category imports.
const INVALIDATION_CHUNK_SIZE = 16

type CategoryDataRow = {
  rss_feed_item_id: string
  category_text: string
  exists: boolean
  existing_topic_id: string | null
  existing_topic_alias_id: string | null
  new_topic_id: string | null
  new_topic_alias_id: string | null
  topic_relation_confirmed: boolean
  hashtag_relation_confirmed: boolean
}

// Canonical definition lives in @voucha/types/entities/rss-feed-item (avoids a
// @queues/rss-feed-item-categories <-> @services/rss-feed-items workspace cycle:
// the queue needs the input shape but must not reach into services/rss-feed-items).
import type { RssFeedItemCategoryInput } from '@voucha/types/entities/rss-feed-item'

export type { RssFeedItemCategoryInput }

export async function upsertRssFeedItemCategories(
  items: RssFeedItemCategoryInput[],
): Promise<void> {
  if (!items || items.length === 0) {
    return
  }

  const snapshots = normalizeRssFeedItemCategorySnapshots(items)
  await withRssFeedItemCategorySnapshotLocks(
    snapshots.map(snapshot => snapshot.rss_feed_item_id),
    () => upsertRssFeedItemCategorySnapshots(snapshots),
  )
}

async function upsertRssFeedItemCategorySnapshots(
  snapshots: ReturnType<typeof normalizeRssFeedItemCategorySnapshots>,
): Promise<void> {
  const categorySqlBatches = buildRssFeedItemCategorySqlBatches(snapshots)

  await insertMissingHashtagAliases(
    categorySqlBatches.flatMap(batch =>
      batch.flatMap(category => (category.hashtag_alias ? [category.hashtag_alias] : [])),
    ),
  )

  const categoryData: CategoryDataRow[] = []
  for (const batch of categorySqlBatches) {
    // oxlint-disable-next-line no-await-in-loop -- sequential category reads bound database pool use for large imports
    categoryData.push(...(await readCategoryDataChunk(batch)))
  }

  const toInsert: Array<{
    rss_feed_item_id: string
    category: string
    hashtag_alias: string | null
  }> = []
  const toUpdate: Array<{
    rss_feed_item_id: string
    category: string
    topicId?: string | null
    topicAliasId?: string | null
  }> = []
  const resolvedTopicPairs: Array<{ rss_feed_item_id: string; topic_id: string }> = []
  const resolvedHashtagPairs: Array<{ rss_feed_item_id: string; topic_alias_id: string }> = []
  const seen = new Set<string>()

  for (const row of categoryData) {
    const key = `${row.rss_feed_item_id}:${row.category_text.toLowerCase()}`
    // Skip duplicates (can happen if multiple topic aliases match)
    if (seen.has(key)) continue
    seen.add(key)

    const topicMappingChanged =
      !row.exists || (row.existing_topic_id === null && row.new_topic_id !== null)
    const hashtagMappingChanged =
      !row.exists || (row.existing_topic_alias_id === null && row.new_topic_alias_id !== null)

    if (!row.exists) {
      const hashtagAlias = normalizeHashtag(row.category_text)?.key ?? null
      toInsert.push({
        rss_feed_item_id: row.rss_feed_item_id,
        category: row.category_text,
        hashtag_alias: hashtagAlias,
      })
    } else if (
      (row.existing_topic_id === null && row.new_topic_id !== null) ||
      (row.existing_topic_alias_id === null && row.new_topic_alias_id !== null)
    ) {
      toUpdate.push({
        rss_feed_item_id: row.rss_feed_item_id,
        category: row.category_text,
        topicId: row.new_topic_id,
        topicAliasId: row.new_topic_alias_id,
      })
    }

    const topicId = row.existing_topic_id ?? row.new_topic_id
    if (topicId !== null && (topicMappingChanged || !row.topic_relation_confirmed)) {
      resolvedTopicPairs.push({ rss_feed_item_id: row.rss_feed_item_id, topic_id: topicId })
    }
    const topicAliasId = row.existing_topic_alias_id ?? row.new_topic_alias_id
    if (topicAliasId !== null && (hashtagMappingChanged || !row.hashtag_relation_confirmed)) {
      resolvedHashtagPairs.push({
        rss_feed_item_id: row.rss_feed_item_id,
        topic_alias_id: topicAliasId,
      })
    }
  }

  await using query = await beginTransaction()
  {
    await lockTopicAliasPublicationScopes(
      query,
      [
        ...categoryData.flatMap(row => [row.existing_topic_alias_id, row.new_topic_alias_id]),
        ...toUpdate.map(category => category.topicAliasId),
      ].filter((id): id is string => id !== null && id !== undefined),
    )
    await lockRssFeedItemsForStoryPublicationChanges(query, [
      ...toInsert.map(category => category.rss_feed_item_id),
      ...toUpdate.map(category => category.rss_feed_item_id),
    ])
    const [inserted, updated] = await Promise.all([
      insertMissingCategories(toInsert, query),
      updateMatchedCategories(toUpdate, query),
    ])
    await recordCategoryPublicationChanges(
      query,
      [...inserted, ...updated],
      resolvedHashtagPairs.map(pair => pair.topic_alias_id),
    )
  }
  await query.commit()

  await createCategoryRelations(resolvedTopicPairs, resolvedHashtagPairs, {
    enqueueTopHashtagRefresh: false,
  })
  await reconcileRssFeedItemCategorySnapshots(snapshots)

  const changedItemIds = [
    ...new Set([
      ...snapshots.map(snapshot => snapshot.rss_feed_item_id),
      ...toInsert.map(i => i.rss_feed_item_id),
      ...toUpdate.map(u => u.rss_feed_item_id),
      ...resolvedTopicPairs.map(pair => pair.rss_feed_item_id),
      ...resolvedHashtagPairs.map(pair => pair.rss_feed_item_id),
    ]),
  ]
  for (const chunk of chunkArray(changedItemIds, INVALIDATION_CHUNK_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- purge chunks settle sequentially to bound Valkey pressure and vararg size
    await invalidateRssFeedItemsAndWaitForPurge(...chunk)
  }
  if (changedItemIds.length > 0) void enqueueRefreshTopHashtags()
}

async function recordCategoryPublicationChanges(
  query: TransactionQuery,
  changes: readonly CategoryTopicMutation[],
  repairedTopicAliasIds: readonly string[],
): Promise<void> {
  await recordStoryPublicationChangesForCategoryTopics(query, changes)
  await recordTopicAliasPublicationWork(query, [
    ...repairedTopicAliasIds,
    ...changes.flatMap(change =>
      change.previous_topic_alias_id !== change.topic_alias_id
        ? [change.previous_topic_alias_id, change.topic_alias_id].filter(
            (id): id is string => id !== null,
          )
        : [],
    ),
  ])
}

export const getRssFeedItemCategories = async (rss_feed_item_id: string) => {
  const { rows } = await read(
    `/* getRssFeedItemCategories */
    SELECT
      rss_feed_item_id,
      category_text,
      topic_id,
      created_at,
      updated_at
    FROM rss_feed_item_categories
    WHERE rss_feed_item_id = $1
  `,
    [rss_feed_item_id],
  )
  return rows
}
