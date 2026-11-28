import { beginTransaction, type QueryExecutor } from '@data-stores/psql'

async function insertJob(query: QueryExecutor, postId: string, storyId: string) {
  await query(
    `/* insertProjectionFenceJob */
    INSERT INTO story_post_related_url_projection_jobs (post_id, story_id) VALUES ($1, $2)`,
    [postId, storyId],
  )
}

async function insertRelation(query: QueryExecutor, postId: string, urlId: string, userId: string) {
  const { rows } = await query<{ id: string }>(
    `/* insertProjectionFenceRelation */
    INSERT INTO relation__post__related__url (subject_id, object_id, created_by_id)
    VALUES ($1, $2, $3) RETURNING id`,
    [postId, urlId, userId],
  )
  return rows[0]!.id
}

async function insertFence(query: QueryExecutor, postId: string, relationId: string) {
  await query(
    `/* insertProjectionFence */
    INSERT INTO story_post_related_url_projection_relation_mutations
      (post_id, generation, relation_id) VALUES ($1, 1, $2)`,
    [postId, relationId],
  )
}

async function readFenceRelationIds(query: QueryExecutor, postId: string) {
  const { rows } = await query<{ relation_id: string }>(
    `/* readProjectionFenceRelationIds */
    SELECT relation_id FROM story_post_related_url_projection_relation_mutations
    WHERE post_id = $1`,
    [postId],
  )
  return rows.map(row => row.relation_id)
}

export async function insertProjectionFenceForMissingRelation(params: {
  postId: string
  storyId: string
  missingRelationId: string
}): Promise<void> {
  await using query = await beginTransaction()
  await insertJob(query, params.postId, params.storyId)
  await insertFence(query, params.postId, params.missingRelationId)
}

export async function insertProjectionFenceForOtherPostRelation(params: {
  postId: string
  otherPostId: string
  storyId: string
  urlId: string
  userId: string
}): Promise<void> {
  await using query = await beginTransaction()
  await insertJob(query, params.postId, params.storyId)
  const otherRelationId = await insertRelation(
    query,
    params.otherPostId,
    params.urlId,
    params.userId,
  )
  await insertFence(query, params.postId, otherRelationId)
}

export async function recordAndCascadeProjectionFence(params: {
  postId: string
  storyId: string
  urlId: string
  userId: string
}): Promise<{ relationId: string; beforeDeleteIds: string[]; afterDeleteIds: string[] }> {
  await using query = await beginTransaction()
  await insertJob(query, params.postId, params.storyId)
  const relationId = await insertRelation(query, params.postId, params.urlId, params.userId)
  const beforeDeleteIds = await readFenceRelationIds(query, params.postId)
  await query(
    '/* deleteProjectionFenceRelation */ DELETE FROM relation__post__related__url WHERE id = $1',
    [relationId],
  )
  const afterDeleteIds = await readFenceRelationIds(query, params.postId)
  return { relationId, beforeDeleteIds, afterDeleteIds }
}
