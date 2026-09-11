import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestStoryPostProjectionReceiptCount(postId: string): Promise<number> {
  const { rows } = await write<{ count: string }>(sql`/* getTestStoryPostProjectionReceiptCount */
    SELECT COUNT(*)::text AS count
    FROM story_post_related_url_projection_receipts
    WHERE post_id = ${postId}
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function getTestStoryPostProjectionReceiptState(
  postId: string,
  generation: string | number,
  urlId: string,
): Promise<{
  crawlRequired: boolean | null
  effectsDispatchedAt: Date | null
  eligible: boolean
}> {
  const { rows } = await write<{
    crawl_required: boolean | null
    effects_dispatched_at: Date | null
    eligible: boolean
  }>(sql`/* getTestStoryPostProjectionReceiptState */
    SELECT crawl_required, effects_dispatched_at, eligible
    FROM story_post_related_url_projection_receipts
    WHERE post_id = ${postId} AND generation = ${generation} AND url_id = ${urlId}
  `)
  if (!rows[0]) throw new Error('Expected a story post projection receipt')
  return {
    crawlRequired: rows[0].crawl_required,
    effectsDispatchedAt: rows[0].effects_dispatched_at,
    eligible: rows[0].eligible,
  }
}

export async function getTestStoryPostProjectionRelationStates(
  postId: string,
): Promise<Array<{ relationWrittenAt: Date | null; votesScoreNet: number }>> {
  const { rows } = await write<{
    relation_written_at: Date | null
    votes_score_net: number
  }>(sql`/* getTestStoryPostProjectionRelationStates */
    SELECT receipt.relation_written_at, relation.votes_score_net
    FROM story_post_related_url_projection_receipts receipt
    JOIN relation__post__related__url relation
      ON relation.subject_id = receipt.post_id AND relation.object_id = receipt.url_id
    WHERE receipt.post_id = ${postId} AND receipt.generation = 1
  `)
  return rows.map(row => ({
    relationWrittenAt: row.relation_written_at,
    votesScoreNet: row.votes_score_net,
  }))
}

export async function getTestStoryPostRelatedUrlDeletedById(
  postId: string,
  urlId: string,
): Promise<string | null> {
  const { rows } = await write<{ deleted_by_id: string | null }>(
    sql`/* getTestStoryPostRelatedUrlDeletedById */
      SELECT deleted_by_id
      FROM relation__post__related__url
      WHERE subject_id = ${postId} AND object_id = ${urlId}`,
  )
  return rows[0]?.deleted_by_id ?? null
}

export async function clearTestStoryPostRelatedUrlVote(
  postId: string,
  urlId: string,
): Promise<void> {
  await write(sql`/* clearTestStoryPostRelatedUrlVote */
    WITH target AS (
      SELECT id FROM relation__post__related__url
      WHERE subject_id = ${postId} AND object_id = ${urlId}
    ), cleared AS (
      DELETE FROM entity_relation_votes
      WHERE entity_relation_id IN (SELECT id FROM target)
    )
    UPDATE relation__post__related__url relation
    SET
      votes_score_up = 0,
      votes_score_none = 0,
      votes_score_down = 0,
      votes_count_up = 0,
      votes_count_none = 0,
      votes_count_down = 0
    WHERE relation.id IN (SELECT id FROM target)`)
}

export async function getTestStoryPostRelatedUrlVoteState(
  postId: string,
  urlId: string,
): Promise<{ votesScoreNet: number; voterId: string | null; score: number | null }> {
  const { rows } = await write<{
    votes_score_net: number
    user_id: string | null
    score: number | null
  }>(sql`/* getTestStoryPostRelatedUrlVoteState */
    SELECT relation.votes_score_net, vote.user_id, vote.score
    FROM relation__post__related__url relation
    LEFT JOIN LATERAL (
      SELECT user_id, score
      FROM entity_relation_votes
      WHERE entity_relation_id = relation.id
      ORDER BY id DESC
      LIMIT 1
    ) vote ON TRUE
    WHERE relation.subject_id = ${postId} AND relation.object_id = ${urlId}`)
  const row = rows[0]
  if (!row) throw new Error('Expected post related URL relation')
  return { votesScoreNet: row.votes_score_net, voterId: row.user_id, score: row.score }
}

export async function insertTestStoryPostProjectionJob(
  postId: string,
  storyId: string,
): Promise<void> {
  await write(sql`/* insertTestStoryPostProjectionJob */
    INSERT INTO story_post_related_url_projection_jobs (post_id, story_id)
    VALUES (${postId}, ${storyId})
  `)
}

export async function getTestStoryPostProjectionGeneration(postId: string): Promise<number> {
  const { rows } = await write<{
    generation: number
  }>(sql`/* getTestStoryPostProjectionGeneration */
    SELECT generation
    FROM story_post_related_url_projection_jobs
    WHERE post_id = ${postId}
  `)
  return Number(rows[0]?.generation ?? 0)
}

export async function deleteTestStoryPostProjectionJob(postId: string): Promise<void> {
  await write(sql`/* deleteTestStoryPostProjectionJob */
    DELETE FROM story_post_related_url_projection_jobs WHERE post_id = ${postId}
  `)
}

export async function expireTestStoryPostProjectionLeaseAfterLock(
  postId: string,
  locked: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* lockStoryPostRelatedUrlProjectionForLeaseExpiryTest */
      SELECT 1 FROM story_post_related_url_projection_jobs WHERE post_id = $1 FOR UPDATE`,
    [postId],
  )
  locked.resolve()
  await release.promise
  await query(
    `/* expireStoryPostRelatedUrlProjectionLeaseForTest */
      UPDATE story_post_related_url_projection_jobs
      SET lease_expires_at = clock_timestamp() WHERE post_id = $1`,
    [postId],
  )
  await query.commit()
}
