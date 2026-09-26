import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markTestPostDeletedBy(postId: string, deletedById: string): Promise<void> {
  await write(sql`/* markTestPostDeletedBy */
    UPDATE posts
    SET deleted_at = NOW(),
        deleted_by_id = ${deletedById}
    WHERE id = ${postId}
  `)
}

export async function hardDeleteTestPosts(postIds: readonly string[]): Promise<void> {
  if (postIds.length === 0) return
  await write(sql`/* hardDeleteTestPosts */
    DELETE FROM posts
    WHERE id = ANY(${postIds})
  `)
}

export async function hardDeleteTestPost(postId: string): Promise<void> {
  await write(sql`/* hardDeleteTestPost */
    DELETE FROM posts
    WHERE id = ${postId}
  `)
}

export async function countTestPostsCreatedBy(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTestPostsCreatedBy */
    SELECT COUNT(*)::integer AS count FROM posts WHERE created_by_id = ${userId}
  `)
  return rows[0]?.count ?? 0
}

export async function insertTestPostsForUser(userId: string, count: number): Promise<string[]> {
  const sha256 = `\\x${'0'.repeat(64)}`
  const { rows } = await write<{ id: string }>(sql`/* insertTestPostsForUser */
    INSERT INTO posts (
      post_type, title, markdown, created_by_id,
      bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256,
      created_via
    )
    SELECT 'discussion', 'Deletion batch ' || value, '', ${userId},
      ${sha256}, ${sha256}, 'system'
    FROM generate_series(1, ${count}) AS value
    RETURNING id
  `)
  return rows.map(row => row.id)
}

export async function insertTestPostSourcesForContributor(
  postIds: string[],
  topicAliasId: string,
  contributorId: string,
): Promise<void> {
  await write(sql`/* insertTestPostSourcesForContributor */
    INSERT INTO post_topic_alias_sources
      (post_id, topic_alias_id, contributor_id, source, authored_token)
    SELECT post_id, ${topicAliasId}, ${contributorId}, 'explicit', '#deletion-batch'
    FROM UNNEST(${postIds}::uuid[]) AS post_id
  `)
}

export async function countTestPostSourcesForContributor(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTestPostSourcesForContributor */
    SELECT COUNT(*)::integer AS count
    FROM post_topic_alias_sources WHERE contributor_id = ${userId}
  `)
  return rows[0]?.count ?? 0
}
