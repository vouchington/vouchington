import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockPostPublicationPostScopes } from '../../services/post-publication/capture-posts.mts'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'

export async function markTestPostDeletedBy(postId: string, deletedById: string): Promise<void> {
  await write(sql`/* markTestPostDeletedBy */
    UPDATE posts
    SET deleted_at = NOW(),
        deleted_by_id = ${deletedById}
    WHERE id = ${postId}
  `)
}

/**
 * Hard-deletes posts under the publication post-scope locks. The `posts` delete cascades into
 * relation rows, so without the scope lock it takes post row -> relation row while a live
 * vote-stats or publication worker takes relation row -> post row (the FK check), a lock cycle.
 */
export async function hardDeleteTestPosts(postIds: readonly string[]): Promise<void> {
  if (postIds.length === 0) return
  await using transaction = await beginTransaction()
  await lockPostPublicationPostScopes(transaction, postIds)
  await transaction(sql`/* hardDeleteTestPosts */
    DELETE FROM posts
    WHERE id = ANY(${postIds})
  `)
  await transaction.commit()
}

export async function hardDeleteTestPost(postId: string): Promise<void> {
  await hardDeleteTestPosts([postId])
}

/**
 * Pauses a vote-stats-worker-shaped transaction: it holds the post scope lock and a topic relation
 * row lock, then `complete()` retains an identity bridge (an FK key-share check on the post row)
 * and commits. Against a lock-free post delete that last step is the other half of a lock cycle.
 */
export async function startPausedTestPostTopicRelationWriter(
  postId: string,
  relationId: string,
): Promise<{ holderProcessId: number; complete(): Promise<void> }> {
  const paused = Promise.withResolvers<number>()
  const resume = Promise.withResolvers<void>()
  const completed = (async () => {
    await using transaction = await beginTransaction()
    await lockPostPublicationPostScopes(transaction, [postId])
    await transaction(sql`/* startPausedTestPostTopicRelationWriter:relation */
      SELECT id FROM relation__post__category__topic WHERE id = ${relationId} FOR UPDATE
    `)
    paused.resolve(await getTestPostgresBackendProcessId(transaction))
    await resume.promise
    await transaction(sql`/* startPausedTestPostTopicRelationWriter:post */
      SELECT id FROM posts WHERE id = ${postId} FOR KEY SHARE
    `)
    await transaction.commit()
  })()
  void completed.catch(paused.reject)
  const holderProcessId = await paused.promise
  return {
    holderProcessId,
    complete: () => {
      resume.resolve()
      return completed
    },
  }
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
