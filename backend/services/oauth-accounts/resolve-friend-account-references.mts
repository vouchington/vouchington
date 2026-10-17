import type { QueryExecutor } from '@data-stores/psql/types'
import type { OAuthAccount, OAuthProvider } from './providers.mts'

export async function resolveFriendAccountReferences(
  provider: OAuthProvider,
  account: OAuthAccount,
  providerUserId: string,
  query: QueryExecutor,
): Promise<void> {
  if (provider === 'facebook') {
    if (!account.account_id) throw new Error('Facebook account has no internal id')
    await query(
      `/* resolveFacebookFriendAccounts */ UPDATE facebook_friends
       SET friend_facebook_account_id = $1
       WHERE facebook_friend_id = $2
         AND friend_facebook_account_id IS DISTINCT FROM $1`,
      [account.account_id, providerUserId],
    )
  }
  if (provider === 'x') {
    if (!account.account_id) throw new Error('X account has no internal id')
    await query(
      `/* resolveXFriendAccounts */ UPDATE x_friends
       SET friend_x_account_id = $1
       WHERE x_friend_id = $2
         AND friend_x_account_id IS DISTINCT FROM $1`,
      [account.account_id, providerUserId],
    )
  }
}
