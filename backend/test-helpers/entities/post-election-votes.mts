/**
 * Post vote entity helpers
 */

import { type TransactionQuery, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Insert post vote
 */
export async function insertPostElectionVote(
  userId: string,
  postId: string,
  score: number,
  id?: string,
  scoreIsNeutral = false,
  scoreIsSemantic = false,
): Promise<void> {
  await write(sql`/* insertPostElectionVote */
    INSERT INTO post_votes (id, user_id, post_id, score, score_is_neutral, score_is_semantic)
    VALUES (COALESCE(${id}::uuid, uuidv7()), ${userId}, ${postId}, ${score}, ${scoreIsNeutral}, ${scoreIsSemantic})
  `)
}

export async function insertPostElectionVoteAndWaitBeforeCommit(options: {
  userId: string
  postId: string
  score: number
  id: string
  inserted: () => void
  waitBeforeCommit: Promise<void>
}): Promise<void> {
  {
    await using transaction = await beginTransaction()
    await insertPostElectionVoteWithQuery(transaction, options)
    options.inserted()
    await options.waitBeforeCommit
    await transaction.commit()
  }
}

export async function lockTestPostAndWaitBeforeCommit(
  postId: string,
  locked: () => void,
  waitBeforeCommit: Promise<void>,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    await transaction(sql`/* lockTestPostAndWaitBeforeCommit */
        SELECT id FROM posts WHERE id = ${postId} FOR UPDATE
      `)
    locked()
    await waitBeforeCommit
    await transaction.commit()
  }
}

export async function insertPostElectionVoteAt(
  userId: string,
  postId: string,
  score: number,
  createdAt: Date,
): Promise<void> {
  await write(sql`/* insertPostElectionVoteAt */
    INSERT INTO post_votes (id, user_id, post_id, score, score_is_neutral, score_is_semantic)
    VALUES (
      uuidv7(to_timestamp(${createdAt.getTime()} / 1000.0) - clock_timestamp()),
      ${userId}, ${postId}, ${score}, FALSE, FALSE
    )
  `)
}

export async function getLatestPostElectionVoteCreatedAt(
  userId: string,
  postId: string,
): Promise<Date | null> {
  const { rows } = await write<{ created_at: Date }>(sql`/* getLatestPostElectionVoteCreatedAt */
    SELECT created_at FROM post_votes
    WHERE user_id = ${userId} AND post_id = ${postId}
    ORDER BY id DESC LIMIT 1
  `)
  return rows[0]?.created_at ?? null
}

export async function setPostElectionUpvoteStats(
  postId: string,
  scoreUp: number,
  countUp: number,
): Promise<void> {
  await write(sql`/* setPostElectionUpvoteStats */
    UPDATE posts
    SET votes_score_up = ${scoreUp}, votes_count_up = ${countUp}
    WHERE id = ${postId}
  `)
}

/**
 * Reads back the persisted vote-count/snapshot columns from the primary. Uses `write` (not `read`)
 * because callers check state immediately after a primary write and a replica read could lag it.
 */
export async function getPersistedPostVoteStats(postId: string): Promise<{
  votes_count_up: number
  votes_snapshot_xmax: string | null
  votes_snapshot_xip_count: number | null
}> {
  const { rows } = await write<{
    votes_count_up: number
    votes_snapshot_xmax: string | null
    votes_snapshot_xip_count: number | null
  }>(
    sql`/* getPersistedPostVoteStats */
      SELECT votes_count_up, votes_snapshot_xmax, votes_snapshot_xip_count
      FROM posts WHERE id = ${postId}
    `,
  )
  return rows[0]!
}

async function insertPostElectionVoteWithQuery(
  query: TransactionQuery,
  options: {
    userId: string
    postId: string
    score: number
    id: string
  },
): Promise<void> {
  await query(sql`/* insertPostElectionVoteAndWaitBeforeCommit */
    INSERT INTO post_votes (id, user_id, post_id, score, score_is_neutral, score_is_semantic)
    VALUES (${options.id}, ${options.userId}, ${options.postId}, ${options.score}, FALSE, FALSE)
  `)
}
