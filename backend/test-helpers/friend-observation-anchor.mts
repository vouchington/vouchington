import { write } from '@data-stores/psql'

export async function getTestGithubFriendObservationAnchor(
  githubUserId: string,
  friendIds: readonly string[],
): Promise<string> {
  const { rows } = await write<{ observed_at: string | null }>(
    `/* getTestGithubFriendObservationAnchor */
    SELECT max(last_observed_at)::text AS observed_at
    FROM github_friends
    WHERE github_user_id = $1 AND github_friend_id = ANY($2::text[])`,
    [githubUserId, [...friendIds]],
  )
  const observedAt = rows[0]?.observed_at
  if (!observedAt) throw new Error('Expected owned GitHub friend observation timestamp')
  return observedAt
}
