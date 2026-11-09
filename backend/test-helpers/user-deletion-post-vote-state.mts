import { write } from '@data-stores/psql'

/** Remove only this fixture's history, leaving its independent current ballot. */
export async function removeOwnedPostVoteHistoryForTest(
  userId: string,
  postId: string,
): Promise<void> {
  await write(
    '/* removeOwnedPostVoteHistoryForTest */ DELETE FROM post_votes WHERE user_id = $1 AND post_id = $2',
    [userId, postId],
  )
}

export async function countOwnedPostVoteStatesForTest(
  userId: string,
  postId: string,
): Promise<number> {
  const { rows } = await write<{ count: number }>(
    '/* countOwnedPostVoteStatesForTest */ SELECT count(*)::int AS count FROM post_vote_states WHERE user_id = $1 AND post_id = $2',
    [userId, postId],
  )
  return rows[0]!.count
}
