/**
 * Topic vote entity helpers
 */

import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Insert a topic vote for a given user and topic.
 */
export async function insertTopicElectionVote(
  userId: string,
  topicId: string,
  score: number | null,
  id?: string,
  scoreIsNeutral = false,
  scoreIsSemantic = false,
): Promise<void> {
  await write(sql`/* insertTopicElectionVote */
    INSERT INTO topic_votes (id, user_id, topic_id, score, score_is_neutral, score_is_semantic)
    VALUES (COALESCE(${id}::uuid, uuidv7()), ${userId}, ${topicId}, ${score}, ${scoreIsNeutral}, ${scoreIsSemantic})
  `)
}

export async function getLatestTopicElectionVoteProvenance(
  userId: string,
  topicId: string,
): Promise<{ scoreIsSemantic: boolean } | null> {
  const { rows } = await write<{
    score_is_semantic: boolean
  }>(sql`/* getLatestTopicElectionVoteProvenance */
    SELECT score_is_semantic FROM topic_votes
    WHERE user_id = ${userId} AND topic_id = ${topicId}
    ORDER BY id DESC LIMIT 1
  `)
  const row = rows[0]
  return row ? { scoreIsSemantic: row.score_is_semantic } : null
}

export async function getTopicElectionNetScore(topicId: string): Promise<number | null> {
  const { rows } = await write<{ votes_score_net: number }>(sql`/* getTopicElectionNetScore */
    SELECT votes_score_net FROM topics WHERE id = ${topicId}
  `)
  const score = rows[0]?.votes_score_net
  return score === undefined ? null : Number(score)
}

export async function getTopicElectionVoteEventCount(
  userId: string,
  topicId: string,
): Promise<number> {
  const { rows } = await write<{ count: number }>(sql`/* getTopicElectionVoteEventCount */
    SELECT COUNT(*)::integer AS count FROM topic_votes
    WHERE user_id = ${userId} AND topic_id = ${topicId}
  `)
  return rows[0]?.count ?? 0
}

export async function setTopicElectionNeutralStats(
  topicId: string,
  scoreNone: number,
  countNone: number,
): Promise<void> {
  await write(sql`/* setTopicElectionNeutralStats */
    UPDATE topics
    SET votes_score_none = ${scoreNone}, votes_count_none = ${countNone}
    WHERE id = ${topicId}
  `)
}

export async function getTopicElectionNeutralStats(
  topicId: string,
): Promise<{ scoreNone: number; countNone: number } | null> {
  const { rows } = await write<{ votes_score_none: number; votes_count_none: number }>(
    sql`/* getTopicElectionNeutralStats */
      SELECT votes_score_none, votes_count_none FROM topics
      WHERE id = ${topicId}
    `,
  )
  const row = rows[0]
  return row ? { scoreNone: Number(row.votes_score_none), countNone: row.votes_count_none } : null
}
