import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { write } from '@data-stores/psql'
import type { OAuthAccount } from './_oauth-config-support.mts'

export async function insertTestMicrosoftOAuthAccount(
  providerUserId: string,
  accountId: string,
  providerUserEmailAddress: string | null = null,
): Promise<OAuthAccount> {
  const { rows } = await write<OAuthAccount>(
    allowUnannotatedQuery(`
      INSERT INTO microsoft_accounts (
        microsoft_user_id,
        microsoft_user_email_address,
        microsoft_user_data,
        id
      )
      VALUES ($1, $2, '{}', $3)
      RETURNING
        user_id,
        microsoft_user_id AS provider_user_id,
        id AS account_id,
        microsoft_user_email_address AS provider_user_email_address,
        microsoft_user_data AS provider_user_data
    `),
    [providerUserId, providerUserEmailAddress, accountId],
  )
  return rows[0]
}
