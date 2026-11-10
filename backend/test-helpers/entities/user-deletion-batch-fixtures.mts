import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestUserDeletionPostVotes(
  userId: string,
  postId: string,
  count: number,
): Promise<void> {
  await write(
    sql`/* insertTestUserDeletionPostVotes */
    INSERT INTO post_votes (user_id, post_id, score)
    SELECT ${userId}, ${postId}, 1
    FROM generate_series(1, ${count})
  `,
  )
}

export async function countTestUserDeletionPostVotes(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    sql`/* countTestUserDeletionPostVotes */
    SELECT COUNT(*)::int AS count
    FROM post_votes
    WHERE user_id = ${userId}
  `,
  )
  return rows[0]?.count ?? 0
}

export async function insertTestUserDeletionLists(userId: string, count: number): Promise<void> {
  await write(
    sql`/* insertTestUserDeletionLists */
    INSERT INTO user_lists (owner_user_id, name, created_via)
    SELECT ${userId}, 'deletion batch list ' || ordinality, 'system'
    FROM generate_series(1, ${count}) WITH ORDINALITY AS generated(value, ordinality)
  `,
  )
}

export async function countTestUserDeletionActiveLists(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    sql`/* countTestUserDeletionActiveLists */
    SELECT COUNT(*)::int AS count
    FROM user_lists
    WHERE owner_user_id = ${userId}
      AND removed_at IS NULL
  `,
  )
  return rows[0]?.count ?? 0
}

export async function insertTestUserDeletionFollowPostRelations(
  userId: string,
  postIds: string[],
): Promise<void> {
  await write(
    sql`/* insertTestUserDeletionFollowPostRelations */
    INSERT INTO relation__user__follow__post (subject_id, object_id)
    SELECT ${userId}, post_id
    FROM UNNEST(${postIds}::uuid[]) AS post_id
  `,
  )
}

export async function countTestUserDeletionFollowPostRelations(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    sql`/* countTestUserDeletionFollowPostRelations */
    SELECT COUNT(*)::int AS count
    FROM relation__user__follow__post
    WHERE subject_id = ${userId}
  `,
  )
  return rows[0]?.count ?? 0
}
