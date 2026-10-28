import { randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import { insertTestOAuthAccount } from './entities/oauth-accounts.mts'

/** Keep the real OAuth account constructor; only the edge's observation time needs fixture control. */
export async function createSecurityRetentionFriendAccount(provider: 'facebook' | 'github' | 'x') {
  const account = await insertTestOAuthAccount(provider, randomUUID())
  if (!account.account_id) throw new Error('Friend fixture account has no row identity')
  return account.account_id
}

export async function insertSecurityRetentionFriendFixture(
  query: TransactionQuery,
  provider: 'facebook' | 'github' | 'x',
  accountId: string,
  observedAt: Date,
): Promise<string> {
  const statement =
    provider === 'facebook'
      ? `/* insertSecurityRetentionFacebookFriend */ INSERT INTO facebook_friends
       (facebook_account_id, facebook_friend_id, last_observed_at) VALUES ($1, $2, $3) RETURNING id`
      : provider === 'github'
        ? `/* insertSecurityRetentionGithubFriend */ INSERT INTO github_friends
         (github_account_id, github_friend_id, last_observed_at) VALUES ($1, $2, $3) RETURNING id`
        : `/* insertSecurityRetentionXFriend */ INSERT INTO x_friends
         (x_account_id, x_friend_id, last_observed_at) VALUES ($1, $2, $3) RETURNING id`
  const { rows } = await query<{ id: string }>(statement, [accountId, randomUUID(), observedAt])
  const id = rows[0]?.id
  if (!id) throw new Error('Friend retention fixture was not inserted')
  return id
}
