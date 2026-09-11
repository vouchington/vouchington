import type { TransactionQuery } from '@data-stores/psql/types'
import { retainPostPublicationImpacts } from './capture-impacts.mts'
import { POST_PUBLICATION_CAPTURE_BATCH_SIZE } from './constants.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { lockTopicRssFeedAttachmentLifecycle } from './lock.mts'
import { upsertPostPublicationDirtyWork } from './upsert-dirty-work.mts'
import type { PostPublicationDirtyWork } from './types.mts'

const RSS_FEED_PUBLICATION_REASON = 'rss_feed_discoverability_changed' as const

type RssFeedTopicPublicationChange = {
  rssFeedId: string
  impactedTopicIds: readonly string[]
}

/** Captures many RSS-feed scopes with bounded locking, upsert, and identity-key batches. */
export async function recordRssFeedDiscoverabilityChanges(
  query: TransactionQuery,
  rssFeedIds: readonly string[],
): Promise<PostPublicationDirtyWork[]> {
  const ids = normalizePostPublicationIdentifiers(rssFeedIds)
  const work: PostPublicationDirtyWork[] = []
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- sorted batches preserve the global feed lock order.
    await lockPostPublicationRssFeedScopes(query, batch)
    // oxlint-disable-next-line no-await-in-loop -- each dirty-work upsert is bounded.
    const batchWork = await upsertPostPublicationDirtyWork(query, 'rss_feed', batch, [
      RSS_FEED_PUBLICATION_REASON,
    ])
    // oxlint-disable-next-line no-await-in-loop -- each retained identity-key insert is bounded.
    await retainCurrentRssFeedPublicationKeys(query, batchWork)
    work.push(...batchWork)
  }
  return work
}

/** Retains topic impacts for RSS items that have not been assigned to a story yet. */
export async function recordRssFeedTopicPublicationChanges(
  query: TransactionQuery,
  changes: readonly RssFeedTopicPublicationChange[],
): Promise<PostPublicationDirtyWork[]> {
  const topicIdsByFeedId = new Map<string, Set<string>>()
  for (const change of changes) {
    const [rssFeedId] = normalizePostPublicationIdentifiers([change.rssFeedId])
    if (!rssFeedId) throw new TypeError('RSS feed publication change requires an identifier')
    const topicIds = topicIdsByFeedId.get(rssFeedId) ?? new Set<string>()
    for (const topicId of normalizePostPublicationIdentifiers(change.impactedTopicIds))
      topicIds.add(topicId)
    topicIdsByFeedId.set(rssFeedId, topicIds)
  }
  const feedIds = normalizePostPublicationIdentifiers(topicIdsByFeedId.keys())
  const work: PostPublicationDirtyWork[] = []
  for (let offset = 0; offset < feedIds.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = feedIds.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- sorted batches preserve the global feed lock order.
    await lockPostPublicationRssFeedScopes(query, batch)
    // oxlint-disable-next-line no-await-in-loop -- each dirty-work upsert is bounded.
    const batchWork = await upsertPostPublicationDirtyWork(query, 'rss_feed', batch, [
      'post_topics_changed',
    ])
    const workByFeedId = new Map(
      batchWork.flatMap(row => (row.rss_feed_id ? [[row.rss_feed_id, row.id] as const] : [])),
    )
    // oxlint-disable-next-line no-await-in-loop -- retained topic impacts are bounded with the feed batch.
    await retainPostPublicationImpacts(
      query,
      workByFeedId,
      batch.map(scopeId => ({
        scopeId,
        impacts: { postIds: new Set<string>(), topicIds: topicIdsByFeedId.get(scopeId)! },
      })),
    )
    // oxlint-disable-next-line no-await-in-loop -- retained feed identities are bounded with the feed batch.
    await retainCurrentRssFeedPublicationKeys(query, batchWork)
    work.push(...batchWork)
  }
  return work
}

/** Pre-locks RSS-feed scopes in one global order before a set-based dirty-work capture. */
export async function lockPostPublicationRssFeedScopes(
  query: TransactionQuery,
  rssFeedIds: readonly string[],
): Promise<void> {
  const ids = normalizePostPublicationIdentifiers(rssFeedIds)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- ascending batches preserve global feed lock order.
    await query(
      `/* lockPostPublicationRssFeedScopes */
      SELECT pg_advisory_xact_lock(hashtextextended('rss_feed:' || rss_feed_id::text, 0))
      FROM unnest($1::uuid[]) AS input(rss_feed_id)
      ORDER BY rss_feed_id`,
      [batch],
    )
  }
}

/**
 * Locks every feed attached to the supplied topics before a writer takes topic-backed FK locks.
 * The attachment lifecycle lock makes feed discovery stable while preserving global topic/feed order.
 */
export async function lockTopicRssFeedPublicationScopes(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<string[]> {
  const ids = normalizePostPublicationIdentifiers(topicIds)
  for (const topicId of ids) {
    // oxlint-disable-next-line no-await-in-loop -- sorted topic lifecycles make feed discovery stable.
    await lockTopicRssFeedAttachmentLifecycle(query, topicId)
  }

  const rssFeedIds: string[] = []
  let afterRssFeedId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- globally ordered feed pages keep scope discovery bounded.
    const result = await query<{ id: string }>(
      `/* listTopicRssFeedPublicationScopes */
      SELECT id
      FROM rss_feeds
      WHERE topic_id = ANY($1::uuid[])
        AND deleted_at IS NULL
        AND ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id
      LIMIT $3`,
      [ids, afterRssFeedId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ id: string }> = result.rows
    if (rows.length === 0) break
    rssFeedIds.push(...rows.map(row => row.id))
    afterRssFeedId = rows.at(-1)!.id
  }
  await lockPostPublicationRssFeedScopes(query, rssFeedIds)
  return rssFeedIds
}

export async function retainCurrentRssFeedPublicationKeys(
  query: TransactionQuery,
  work: ReadonlyArray<Pick<PostPublicationDirtyWork, 'id' | 'rss_feed_id'>>,
): Promise<void> {
  const rows = work.flatMap(row =>
    row.rss_feed_id ? [{ dirtyWorkId: row.id, rssFeedId: row.rss_feed_id }] : [],
  )
  if (rows.length === 0) return
  await query(
    `/* retainCurrentRssFeedPublicationKeys */
    INSERT INTO post_publication_dirty_work_keys
      (dirty_work_id, kind, uuid_value)
    WITH input AS (
      SELECT *
      FROM UNNEST($1::uuid[], $2::uuid[]) AS row(dirty_work_id, rss_feed_id)
    ), keys AS (
    SELECT input.dirty_work_id, 'identity_rss_feed'::text AS kind, input.rss_feed_id AS uuid_value
    FROM input
    UNION
    SELECT input.dirty_work_id, 'impact_topic', feed.topic_id
    FROM input
    JOIN rss_feeds feed ON feed.id = input.rss_feed_id
    WHERE feed.topic_id IS NOT NULL
    UNION
    SELECT input.dirty_work_id, 'impact_topic', category.topic_id
    FROM input
    JOIN rss_feed_item_sources source ON source.rss_feed_id = input.rss_feed_id
    JOIN rss_feed_item_categories category
      ON category.rss_feed_item_id = source.rss_feed_item_id
    WHERE category.topic_id IS NOT NULL
    )
    SELECT DISTINCT dirty_work_id, kind, uuid_value FROM keys
    ORDER BY dirty_work_id, kind, uuid_value
    ON CONFLICT (dirty_work_id, kind, uuid_value) WHERE uuid_value IS NOT NULL DO NOTHING`,
    [rows.map(row => row.dirtyWorkId), rows.map(row => row.rssFeedId)],
  )
}
