import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Streams OAuth account rows for the given user (provider name + email only, no tokens). */
export function streamOAuthAccounts(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamOAuthAccounts */
    SELECT 'facebook' AS provider, facebook_user_email_address AS provider_email, created_at
      FROM facebook_accounts WHERE user_id = ${userId}
    UNION ALL
    SELECT 'apple' AS provider, apple_user_email_address AS provider_email, created_at
      FROM apple_accounts WHERE user_id = ${userId}
    UNION ALL
    SELECT 'google' AS provider, google_user_email_address AS provider_email, created_at
      FROM google_accounts WHERE user_id = ${userId}
    UNION ALL
    SELECT 'x' AS provider, x_user_email_address AS provider_email, created_at
      FROM x_accounts WHERE user_id = ${userId}
    UNION ALL
    SELECT 'linkedin' AS provider, linkedin_user_email_address AS provider_email, created_at
      FROM linkedin_accounts WHERE user_id = ${userId}
    UNION ALL
    SELECT 'microsoft' AS provider, microsoft_user_email_address AS provider_email, created_at
      FROM microsoft_accounts WHERE user_id = ${userId}
    UNION ALL
    SELECT 'github' AS provider, github_user_email_address AS provider_email, created_at
      FROM github_accounts WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `)
}
