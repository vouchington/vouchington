import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// @data-stores/psql cannot depend on @voucha/test-helpers (see users.mts in this directory for why).
// Trimmed to the single provider (google) that view-users.test.mts exercises — test-helpers'
// oauth-accounts.mts generalizes over 7 providers for the whole backend, which view-users.test.mts
// does not need.
export async function insertLocalTestGoogleAccount(googleUserId: string): Promise<void> {
  await write(sql`
    INSERT INTO google_accounts (google_user_id, google_user_data)
    VALUES (${googleUserId}, '{}')
  `)
}

export async function connectLocalTestGoogleAccount(
  userId: string,
  googleUserId: string,
): Promise<void> {
  const { rowCount } = await write(sql`
    UPDATE google_accounts SET user_id = ${userId} WHERE google_user_id = ${googleUserId}
  `)
  if (!rowCount) {
    throw new Error(`connectLocalTestGoogleAccount: no google account found for ${googleUserId}`)
  }
}
