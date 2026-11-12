import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordPostPublicationChanges } from '../../services/post-publication/capture-posts.mts'

export async function markTestPostDeletedBy(postId: string, deletedById: string): Promise<void> {
  await write(sql`/* markTestPostDeletedBy */
    UPDATE posts
    SET deleted_at = NOW(),
        deleted_by_id = ${deletedById}
    WHERE id = ${postId}
  `)
}

/**
 * Every deleted post runs one foreign-key probe per referencing table (about 65), so a single
 * 1,000-post statement made roughly 65,000 probes and took about 450 ms on an idle local database.
 * That left under 5x headroom against the 2 s test statement_timeout on a loaded CI runner. A batch
 * of 100 keeps each statement near 45 ms inside the one transaction, so the locks and atomicity of
 * the delete are unchanged.
 */
const HARD_DELETE_POST_BATCH_SIZE = 100

/**
 * Hard-deletes posts under the publication post-scope locks. The `posts` delete cascades into
 * relation rows, so without the scope lock it takes post row -> relation row while a live
 * vote-stats or publication worker takes relation row -> post row (the FK check), a lock cycle.
 */
export async function hardDeleteTestPosts(postIds: readonly string[]): Promise<void> {
  if (postIds.length === 0) return
  await using transaction = await beginTransaction()
  await recordPostPublicationChanges(
    transaction,
    'post_deleted',
    postIds.map(postId => ({ postId })),
  )
  for (let start = 0; start < postIds.length; start += HARD_DELETE_POST_BATCH_SIZE) {
    const batch = postIds.slice(start, start + HARD_DELETE_POST_BATCH_SIZE)
    await transaction(sql`/* hardDeleteTestPosts */
      DELETE FROM posts
      WHERE id = ANY(${batch})
    `)
  }
  await transaction.commit()
}

export async function hardDeleteTestPost(postId: string): Promise<void> {
  await hardDeleteTestPosts([postId])
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
      gemini_embedding_2_content_sha256,
      llm_moderation_content_sha256,
      created_via
    , bedrock_nova_multimodal_v1_content_sha256)
    SELECT 'discussion', 'Deletion batch ' || value, '', ${userId},
      ${sha256}, ${sha256}, 'system'
    , ${sha256} FROM generate_series(1, ${count}) AS value
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
      (post_id, topic_alias_id, contributor_user_id, source, authored_token)
    SELECT post_id, ${topicAliasId}, ${contributorId}, 'explicit', '#deletion-batch'
    FROM UNNEST(${postIds}::uuid[]) AS post_id
  `)
}

export async function countTestPostSourcesForContributor(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTestPostSourcesForContributor */
    SELECT COUNT(*)::integer AS count
    FROM post_topic_alias_sources WHERE contributor_user_id = ${userId}
  `)
  return rows[0]?.count ?? 0
}
