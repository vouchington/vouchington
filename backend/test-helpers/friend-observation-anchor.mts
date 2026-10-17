import { write } from '@data-stores/psql'

export async function getTestGithubFriendObservationAnchor(
  githubAccountId: string,
  friendIds: readonly string[],
): Promise<string> {
  const { rows } = await write<{ observed_at: string | null }>(
    `/* getTestGithubFriendObservationAnchor */
    SELECT max(last_observed_at)::text AS observed_at
    FROM github_friends
    WHERE github_account_id = $1::uuid AND github_friend_id = ANY($2::text[])`,
    [githubAccountId, [...friendIds]],
  )
  const observedAt = rows[0]?.observed_at
  if (!observedAt) throw new Error('Expected owned GitHub friend observation timestamp')
  return observedAt
}
