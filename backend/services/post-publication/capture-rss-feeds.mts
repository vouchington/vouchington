import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { impactPublicationKeys } from './captured-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'

const RSS_FEED_PUBLICATION_REASON = 'rss_feed_discoverability_changed' as const

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

/** Retained call site. RSS feed publication scopes no longer take an advisory lock. */
export async function lockPostPublicationRssFeedScopes(
  _query: TransactionQuery,
  _rssFeedIds: readonly string[],
): Promise<void> {}
