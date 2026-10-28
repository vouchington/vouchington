import { read, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Inserts a post ballot that references an existing shared user-agent string. */
export async function insertTestPostVoteWithUserAgent(
  postId: string,
  userId: string,
  userAgentStringId: string,
  score: number,
  id?: string,
): Promise<void> {
  await write(sql`/* insertTestPostVoteWithUserAgent */
    INSERT INTO post_votes (id, post_id, user_id, score, user_agent_string_id)
    VALUES (COALESCE(${id}::uuid, uuidv7()), ${postId}, ${userId}, ${score}, ${userAgentStringId}::uuid)
  `)
}

export async function getTestPostVoteIds(
  postId: string,
  userId: string,
  query?: TransactionQuery,
): Promise<string[]> {
  const { rows } = await read<{ id: string }>(
    sql`/* getTestPostVoteIds */
    SELECT id FROM post_votes WHERE post_id = ${postId} AND user_id = ${userId}
    ORDER BY id
  `,
    { query },
  )
  return rows.map(row => row.id)
}

export async function getTestRetainedPostVoteCount(day: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* getTestRetainedPostVoteCount */
    SELECT count FROM post_vote_retained_daily_counts WHERE day = ${day}::date
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function hasTestUserAgentString(id: string): Promise<boolean> {
  const { rows } = await read<{ exists: boolean }>(sql`/* hasTestUserAgentString */
    SELECT EXISTS(SELECT 1 FROM user_agent_strings WHERE id = ${id}::uuid) AS exists
  `)
  return rows[0]?.exists ?? false
}

export async function getTestVoteIntegrityFlagDetails(
  id: string,
): Promise<Record<string, unknown>> {
  const { rows } = await read<{
    details: Record<string, unknown>
  }>(sql`/* getTestVoteIntegrityFlagDetails */
    SELECT details FROM vote_integrity_flags WHERE id = ${id}::uuid
  `)
  return rows[0]?.details ?? {}
}
