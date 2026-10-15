import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { write } from '@data-stores/psql'
import type { OAuthAccount } from './_oauth-config-support.mts'

export async function insertTestLinkedInOAuthAccount(
  providerUserId: string,
  accountId: string,
  providerUserEmailAddress: string | null = null,
): Promise<OAuthAccount & { account_id: string }> {
  const { rows } = await write<OAuthAccount & { account_id: string }>(
    allowUnannotatedQuery(`
      INSERT INTO linkedin_accounts (
        linkedin_user_id,
        linkedin_user_email_address,
        linkedin_user_data,
        id
      )
      VALUES ($1, $2, '{}', $3)
      RETURNING
        user_id,
        linkedin_user_id AS provider_user_id,
        id AS account_id,
        linkedin_user_email_address AS provider_user_email_address,
        linkedin_user_data AS provider_user_data
    `),
    [providerUserId, providerUserEmailAddress, accountId],
  )
  return rows[0]
}
