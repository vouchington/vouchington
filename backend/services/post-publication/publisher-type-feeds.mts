import { randomUUID } from 'node:crypto'
import { registerPostCommitAction, write, type TransactionQuery } from '@data-stores/psql'
import { enqueuePublisherTypeFeedPublication } from '@queues/post-publication/enqueues'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { getPostPublicationWorkLimit } from './work-limits.mts'

/** Surviving feed identities can be discovered after the relation transaction commits. */
export function recordPublisherTypeFeedPublicationWork(
  query: TransactionQuery,
  topicIds: readonly string[],
): void {
  const ids = normalizePostPublicationIdentifiers(topicIds)
  if (ids.length === 0) return
  const data = { changeId: randomUUID(), topicIds: ids, afterTopicId: null }
  registerPostCommitAction(query, async () => {
    await enqueuePublisherTypeFeedPublication(data)
  })
}

/** Page immutable topic identifiers; each topic has at most one surviving feed. */
export async function listPublisherTypeFeedPublicationPage(
  topicIds: readonly string[],
  afterTopicId: string | null,
  pageSize = getPostPublicationWorkLimit('capture_batch_size'),
) {
  const limit = Math.min(pageSize, getPostPublicationWorkLimit('capture_batch_size'))
  // Find the first topic strictly beyond the cursor without copying the remaining snapshot.
  let start = 0
  let end = topicIds.length
  if (afterTopicId !== null) {
    while (start < end) {
      const middle = Math.floor((start + end) / 2)
      if (topicIds[middle]! <= afterTopicId) start = middle + 1
      else end = middle
    }
  }
  const candidates = topicIds.slice(start, start + limit + 1)
  const page = candidates.slice(0, limit)
  const { rows } = await write<{ rss_feed_id: string | null }>(
    `/* listPublisherTypeFeedPublicationPage */
    WITH page AS MATERIALIZED (
      SELECT topic_id FROM unnest($1::uuid[]) AS input(topic_id) LIMIT $2
    )
    SELECT feed.id AS rss_feed_id
    FROM page
    LEFT JOIN LATERAL (
      SELECT id FROM rss_feeds
      WHERE topic_id = page.topic_id AND deleted_at IS NULL
      LIMIT 1
    ) feed ON true`,
    [page, limit],
  )
  const hasMore = candidates.length > limit
  return {
    rssFeedIds: rows.flatMap(row => (row.rss_feed_id ? [row.rss_feed_id] : [])),
    rowsRead: page.length,
    hasMore,
    cursor: hasMore ? page.at(-1)! : null,
  }
}
