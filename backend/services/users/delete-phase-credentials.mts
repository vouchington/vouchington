import sql from 'sql-template-strings'
import { deleteBlueskyDataForUserBatch } from './delete-bluesky-data.mts'
import { sanitizeOAuthAccountPii } from './delete-oauth-pii.mts'
import { withUserDeletionTransaction } from './delete-phase-transaction.mts'

export async function processUserDeletionCredentialsBatch(userId: string, batchSize: number) {
  return withUserDeletionTransaction(userId, async query => {
    const statements = [
      sql`/* processUserDeletionCredentials:facebookFriends */
        DELETE FROM facebook_friends WHERE (facebook_user_id, facebook_friend_id) IN (
          SELECT friend.facebook_user_id, friend.facebook_friend_id FROM facebook_friends friend
          JOIN facebook_accounts account USING (facebook_user_id)
          WHERE account.user_id = ${userId}
          ORDER BY friend.facebook_user_id, friend.facebook_friend_id LIMIT ${batchSize}
        )`,
      sql`/* processUserDeletionCredentials:xFriends */
        DELETE FROM x_friends WHERE (x_user_id, x_friend_id) IN (
          SELECT friend.x_user_id, friend.x_friend_id FROM x_friends friend
          JOIN x_accounts account USING (x_user_id)
          WHERE account.user_id = ${userId}
          ORDER BY friend.x_user_id, friend.x_friend_id LIMIT ${batchSize}
        )`,
      sql`/* processUserDeletionCredentials:githubFriends */
        DELETE FROM github_friends WHERE (github_user_id, github_friend_id) IN (
          SELECT friend.github_user_id, friend.github_friend_id FROM github_friends friend
          JOIN github_accounts account USING (github_user_id)
          WHERE account.user_id = ${userId}
          ORDER BY friend.github_user_id, friend.github_friend_id LIMIT ${batchSize}
        )`,
      sql`/* processUserDeletionCredentials:blueskyFollows */
        DELETE FROM bluesky_follow_records WHERE (follower_user_id, followee_user_id) IN (
          SELECT follower_user_id, followee_user_id FROM bluesky_follow_records
          WHERE follower_user_id = ${userId} OR followee_user_id = ${userId}
          ORDER BY follower_user_id, followee_user_id LIMIT ${batchSize}
        )`,
      sql`/* processUserDeletionCredentials:emails */ DELETE FROM user_email_addresses
      WHERE (user_id, email_address) IN (
        SELECT user_id, email_address FROM user_email_addresses
        WHERE user_id = ${userId} ORDER BY email_address LIMIT ${batchSize}
      )`,
      sql`/* processUserDeletionCredentials:phones */ DELETE FROM user_phone_numbers
      WHERE (user_id, phone_number) IN (
        SELECT user_id, phone_number FROM user_phone_numbers
        WHERE user_id = ${userId} ORDER BY phone_number LIMIT ${batchSize}
      )`,
      sql`/* processUserDeletionCredentials:passkeys */ DELETE FROM user_passkeys WHERE id IN (
        SELECT id FROM user_passkeys WHERE user_id = ${userId} ORDER BY id LIMIT ${batchSize}
      )`,
      sql`/* processUserDeletionCredentials:totp */ DELETE FROM user_totp_authenticators WHERE id IN (
        SELECT id FROM user_totp_authenticators
        WHERE user_id = ${userId} ORDER BY id LIMIT ${batchSize}
      )`,
      sql`/* processUserDeletionCredentials:apiKeys */ DELETE FROM api_keys WHERE id IN (
        SELECT id FROM api_keys WHERE user_id = ${userId} ORDER BY id LIMIT ${batchSize}
      )`,
      sql`/* processUserDeletionCredentials:sessions */ DELETE FROM user_sessions WHERE id IN (
        SELECT id FROM user_sessions WHERE user_id = ${userId} ORDER BY id LIMIT ${batchSize}
      )`,
    ]
    for (const statement of statements) {
      // oxlint-disable-next-line no-await-in-loop -- process one mutation-backed table page per job.
      const result = await query(statement)
      if ((result.rowCount ?? 0) > 0) return { hasMore: true }
    }
    if (await deleteBlueskyDataForUserBatch(userId, batchSize, query)) return { hasMore: true }
    await sanitizeOAuthAccountPii(userId, query)
    return { hasMore: false }
  })
}
