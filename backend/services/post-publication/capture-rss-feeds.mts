import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { impactPublicationKeys } from './captured-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { lockTopicRssFeedAttachmentLifecycle } from './lock.mts'

const RSS_FEED_PUBLICATION_REASON = 'rss_feed_discoverability_changed' as const
const rssFeedScopesLockedInQuery = new WeakMap<TransactionQuery, Set<string>>()

type RssFeedTopicPublicationChange = {
  rssFeedId: string
  impactedTopicIds: readonly string[]
}

/** Captures many RSS-feed scopes before their discoverability mutation commits. */
export async function recordRssFeedDiscoverabilityChanges(
  query: TransactionQuery,
  rssFeedIds: readonly string[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  const ids = normalizePostPublicationIdentifiers(rssFeedIds)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- sorted batches preserve feed lock order.
    await lockPostPublicationRssFeedScopes(query, batch)
    for (const rssFeedId of batch)
      enqueueCapturedPublicationChangeAfterCommit(query, {
        scope: { type: 'rss_feed', rssFeedId },
        reason: RSS_FEED_PUBLICATION_REASON,
        keys: [{ kind: 'identity_rss_feed', uuidValue: rssFeedId }],
      })
  }
}

/** Retains topic impacts for RSS items that have not been assigned to a story yet. */
export async function recordRssFeedTopicPublicationChanges(
  query: TransactionQuery,
  changes: readonly RssFeedTopicPublicationChange[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
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
  for (let offset = 0; offset < feedIds.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = feedIds.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- sorted batches preserve the global feed lock order.
    await lockPostPublicationRssFeedScopes(query, batch)
    for (const rssFeedId of batch)
      enqueueCapturedPublicationChangeAfterCommit(query, {
        scope: { type: 'rss_feed', rssFeedId },
        reason: 'post_topics_changed',
        keys: [
          { kind: 'identity_rss_feed', uuidValue: rssFeedId },
          ...impactPublicationKeys({ topicIds: [...topicIdsByFeedId.get(rssFeedId)!] }),
        ],
      })
  }
}

/** Pre-locks RSS-feed scopes in one global order before capturing post-commit effects. */
export async function lockPostPublicationRssFeedScopes(
  query: TransactionQuery,
  rssFeedIds: readonly string[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  const held = rssFeedScopesLockedInQuery.get(query) ?? new Set<string>()
  // This query already holds these advisory locks until commit.
  // Feeds found after an item-row wait are still locked below.
  const ids = normalizePostPublicationIdentifiers(rssFeedIds).filter(id => !held.has(id))
  if (ids.length === 0) return
  rssFeedScopesLockedInQuery.set(query, held)
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
    for (const id of batch) held.add(id)
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
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
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
