import type { TransactionQuery } from '@data-stores/psql'
import { POST_PUBLICATION_CAPTURE_BATCH_SIZE } from './constants.mts'

export async function getAuthorDeletionPublicationTargets(
  query: TransactionQuery,
  authorUserId: string,
  afterPostId: string | null,
  batchSize = POST_PUBLICATION_CAPTURE_BATCH_SIZE,
): Promise<Array<{ postId: string; isAuthored: boolean }>> {
  const { rows } = await query<{ id: string; is_authored: boolean }>(
    `/* getAuthorDeletionPublicationTargets */ SELECT post.id, post.created_by_id = $1::uuid AS is_authored
    FROM posts post WHERE (post.created_by_id = $1::uuid OR EXISTS (
      SELECT 1 FROM post_topic_alias_sources source WHERE source.post_id = post.id AND source.contributor_id = $1::uuid))
      AND ($2::uuid IS NULL OR post.id > $2::uuid) ORDER BY post.id LIMIT $3`,
    [authorUserId, afterPostId, batchSize],
  )
  return rows.map(row => ({ postId: row.id, isAuthored: row.is_authored }))
}

export type SourceCandidate = { id: string; post_id: string; topic_id: string | null }

export async function getContributedSources(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
): Promise<SourceCandidate[]> {
  return (
    await query<SourceCandidate>(
      `/* processAuthorDeletionPublicationBatch:getSources */
      SELECT source.id, source.post_id, alias.topic_id
      FROM post_topic_alias_sources source
      LEFT JOIN topic_aliases alias ON alias.id = source.topic_alias_id
      WHERE source.contributor_id = $1::uuid
      ORDER BY source.id LIMIT $2`,
      [userId, batchSize],
    )
  ).rows
}

export async function getAuthoredPostIds(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
): Promise<string[]> {
  return (
    await query<{ id: string }>(
      `/* processAuthorDeletionPublicationBatch:getPosts */
      SELECT id FROM posts WHERE created_by_id = $1::uuid ORDER BY id LIMIT $2`,
      [userId, batchSize],
    )
  ).rows.map(row => row.id)
}
