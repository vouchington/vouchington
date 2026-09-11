import type { TransactionQuery } from '@data-stores/psql/types'
import { retainPostPublicationImpactKeys } from './capture-keys.mts'
import {
  POST_PUBLICATION_CAPTURE_BATCH_SIZE,
  POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE,
} from './constants.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { upsertPostPublicationDirtyWork } from './upsert-dirty-work.mts'

export async function recordTopicAliasPublicationWork(
  query: TransactionQuery,
  topicAliasIds: readonly string[],
): Promise<void> {
  const ids = normalizePostPublicationIdentifiers(topicAliasIds)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- ascending bounded batches preserve publication lock order.
    await lockTopicAliasPublicationScopes(query, batch)
    // oxlint-disable-next-line no-await-in-loop -- each dirty-work upsert is bounded to the capture batch size.
    await upsertPostPublicationDirtyWork(query, 'topic_alias', batch, ['post_topics_changed'])
  }
}

/** Acquires topic-alias publication scopes without recording work for a later mutation. */
export async function lockTopicAliasPublicationScopes(
  query: TransactionQuery,
  topicAliasIds: readonly string[],
): Promise<void> {
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

export async function retainTopicAliasPublicationPostImpacts(
  query: TransactionQuery,
  dirtyWorkId: string,
  topicAliasId: string,
): Promise<void> {
  let afterPostId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each ownership page and retained-key write is bounded.
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
        FROM relation__post__category__topic_alias relation
        WHERE relation.object_id = $1::uuid
          AND relation.deleted_at IS NULL
          AND relation.votes_score_net > 0
          AND ($2::uuid IS NULL OR relation.subject_id > $2::uuid)
      ) ownership
      ORDER BY ownership.post_id
      LIMIT $3`,
      [topicAliasId, afterPostId, POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE],
    )
    const rows: Array<{ post_id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- the retained-key helper bounds each insert batch.
    await retainPostPublicationImpactKeys(query, dirtyWorkId, {
      postIds: rows.map(row => row.post_id),
    })
    afterPostId = rows.at(-1)!.post_id
  }
}
