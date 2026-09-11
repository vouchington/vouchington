import type { TransactionQuery } from '@data-stores/psql'

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
