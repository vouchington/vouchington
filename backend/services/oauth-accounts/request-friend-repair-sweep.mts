import type { TransactionQuery } from '@data-stores/psql'

type FriendProvider = 'facebook' | 'github' | 'x'

/**
 * Finishing an erase or resolve marker can leave edges committed behind its scan. One repair sweep
 * per provider revisits them; its cursor row is the pending marker and is deleted when the sweep ends.
 */
export async function requestOAuthFriendRepairSweep(
  query: TransactionQuery,
  provider: FriendProvider,
): Promise<void> {
  await query(
    `/* requestOAuthFriendRepairSweep */ INSERT INTO oauth_friend_reference_repair_cursors (provider)
     VALUES ($1) ON CONFLICT (provider) DO NOTHING`,
    [provider],
  )
}
