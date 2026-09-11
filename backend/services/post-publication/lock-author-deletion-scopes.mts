import type { TransactionQuery } from '@data-stores/psql'
import { POST_PUBLICATION_CAPTURE_BATCH_SIZE } from './constants.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'

/**
 * Locks every author-deletion post scope before relation rows are recomputed. The union keeps
 * authored, contributed, and relation-vote impacts in one global order without materializing the
 * author's full post history in application memory.
 */
export async function lockAuthorDeletionPublicationScopes(
  query: TransactionQuery,
  authorUserId: string,
  relationPostIds: readonly string[],
): Promise<void> {
  const normalizedRelationPostIds = normalizePostPublicationIdentifiers(relationPostIds)
  let afterPostId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- bounded ascending pages establish one global advisory-lock order.
    const result = await query<{ post_id: string }>(
      `/* lockAuthorDeletionPublicationScopes */
      WITH candidate_post_ids AS MATERIALIZED (
        SELECT post.id AS post_id
        FROM posts post
        WHERE post.created_by_id = $1::uuid
          OR EXISTS (
            SELECT 1
            FROM post_topic_alias_sources source
            WHERE source.post_id = post.id AND source.contributor_id = $1::uuid
          )
        UNION
        SELECT input.post_id
        FROM unnest($2::uuid[]) AS input(post_id)
      ), batch AS MATERIALIZED (
        SELECT post_id
        FROM candidate_post_ids
        WHERE ($3::uuid IS NULL OR post_id > $3::uuid)
        ORDER BY post_id
        LIMIT $4
      )
      SELECT post_id,
        pg_advisory_xact_lock(hashtextextended('post:' || post_id::text, 0))
      FROM batch
      ORDER BY post_id`,
      [authorUserId, normalizedRelationPostIds, afterPostId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ post_id: string }> = result.rows
    if (rows.length === 0) return
    afterPostId = rows.at(-1)!.post_id
  }
}
