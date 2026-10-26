import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { impactPublicationKeys } from './captured-keys.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'

export async function recordTopicAliasPublicationWork(
  query: TransactionQuery,
  topicAliasIds: readonly string[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  const ids = normalizePostPublicationIdentifiers(topicAliasIds)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- ascending bounded batches preserve publication lock order.
    await lockTopicAliasPublicationScopes(query, batch)
    for (const topicAliasId of batch) {
      enqueueCapturedPublicationChangeAfterCommit(query, {
        scope: { type: 'topic_alias', topicAliasId },
        reason: 'post_topics_changed',
        keys: [],
      })
    }
  }
}

/** Acquires topic-alias publication scopes without recording work for a later mutation. */
export async function lockTopicAliasPublicationScopes(
  query: TransactionQuery,
  topicAliasIds: readonly string[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  const ids = normalizePostPublicationIdentifiers(topicAliasIds)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- ascending bounded batches preserve publication lock order.
    await query(
      `/* lockTopicAliasPublicationCaptures */
      SELECT pg_advisory_xact_lock(hashtextextended('topic_alias:' || topic_alias_id::text, 0))
      FROM unnest($1::uuid[]) AS input(topic_alias_id) ORDER BY topic_alias_id`,
      [batch],
    )
  }
}

/** Captures pre-delete relation-only posts before an atomic ordinary-alias unlink. */
export async function captureDestroyedTopicAliasPostImpacts(
  query: TransactionQuery,
  changeId: string,
  topicAliasId: string,
): Promise<void> {
  const pageSize = getPostPublicationWorkLimit('effect_payload_key_batch_size')
  let afterPostId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each pre-delete ownership read is one configured page.
    const result = await query<{ post_id: string }>(
      `/* listTopicAliasPublicationPostImpacts */
      SELECT ownership.post_id
      FROM (
        SELECT source.post_id
        FROM post_topic_alias_sources source
        WHERE source.topic_alias_id = $1::uuid
          AND ($2::uuid IS NULL OR source.post_id > $2::uuid)

        UNION ALL

        SELECT relation.subject_id AS post_id
        -- no-mistakes-disable-next-line postgres-required-predicates: reverse alias-object lookup spans subject_id partitions
        FROM relation__post__category__topic_alias relation
        WHERE relation.object_id = $1::uuid
          AND relation.deleted_at IS NULL
          AND relation.votes_score_net > 0
          AND ($2::uuid IS NULL OR relation.subject_id > $2::uuid)
      ) ownership
      ORDER BY ownership.post_id
      LIMIT $3`,
      [topicAliasId, afterPostId, pageSize],
    )
    const rows: Array<{ post_id: string }> = result.rows
    if (rows.length === 0) return
    enqueueCapturedPublicationChangeAfterCommit(query, {
      scope: { type: 'topic_alias', topicAliasId },
      reason: 'post_topics_changed',
      keys: impactPublicationKeys({ postIds: rows.map(row => row.post_id) }),
      changeId,
    })
    afterPostId = rows.at(-1)!.post_id
  }
}
