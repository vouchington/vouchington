import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Confirms the complete primary-written post-vote fixture is visible to replica-backed reads.
 * The latest ballot check prevents an earlier historical row from satisfying the assertion.
 */
export async function isTestPostVoteFixtureVisibleFromReplica({
  postId,
  voterId,
  voteScore,
  votesScoreUp,
  votesCountUp,
}: {
  postId: string
  voterId: string
  voteScore: number
  votesScoreUp: number
  votesCountUp: number
}): Promise<boolean> {
  const { rows } = await read(sql`
    SELECT 1
    FROM posts
    JOIN LATERAL (
      SELECT score, score_is_neutral, score_is_semantic
      FROM post_votes
      WHERE post_id = posts.id AND user_id = ${voterId}
      ORDER BY id DESC
      LIMIT 1
    ) AS latest_vote ON TRUE
    WHERE posts.id = ${postId}
      AND posts.votes_score_up = ${votesScoreUp}
      AND posts.votes_count_up = ${votesCountUp}
      AND latest_vote.score = ${voteScore}
      AND NOT latest_vote.score_is_neutral
      AND NOT latest_vote.score_is_semantic
    LIMIT 1
  `)
  return rows.length > 0
}
