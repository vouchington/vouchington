import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function sanitizeOAuthAccountPii(
  userId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* sanitizeOAuthAccountPii */
    WITH sanitized_facebook AS (
      UPDATE facebook_accounts
      SET user_id = NULL,
          facebook_user_email_address = NULL,
          email_domain_hostname_id = NULL,
          facebook_user_data = '{}'::jsonb,
          access_token_ciphertext = NULL,
          access_token_expires_at = NULL
      WHERE user_id = ${userId}
    ),
    sanitized_apple AS (
      UPDATE apple_accounts
      SET user_id = NULL,
          apple_user_email_address = NULL,
          email_domain_hostname_id = NULL,
          apple_user_data = '{}'::jsonb
      WHERE user_id = ${userId}
    ),
    sanitized_google AS (
      UPDATE google_accounts
      SET user_id = NULL,
          google_user_email_address = NULL,
          email_domain_hostname_id = NULL,
          google_user_data = '{}'::jsonb
      WHERE user_id = ${userId}
    ),
    sanitized_x AS (
      UPDATE x_accounts
      SET user_id = NULL,
          x_user_email_address = NULL,
          x_user_data = '{}'::jsonb,
          access_token_ciphertext = NULL,
          refresh_token_ciphertext = NULL,
          access_token_expires_at = NULL
      WHERE user_id = ${userId}
    ),
    sanitized_linkedin AS (
      UPDATE linkedin_accounts
      SET user_id = NULL,
          linkedin_user_email_address = NULL,
          email_domain_hostname_id = NULL,
          linkedin_user_data = '{}'::jsonb,
          access_token_ciphertext = NULL,
          refresh_token_ciphertext = NULL,
          access_token_expires_at = NULL
      WHERE user_id = ${userId}
    ),
    sanitized_microsoft AS (
      UPDATE microsoft_accounts
      SET user_id = NULL,
          microsoft_user_email_address = NULL,
          email_domain_hostname_id = NULL,
          microsoft_user_data = '{}'::jsonb,
          access_token_ciphertext = NULL,
          refresh_token_ciphertext = NULL,
          access_token_expires_at = NULL
      WHERE user_id = ${userId}
    )
    UPDATE github_accounts
    SET user_id = NULL,
        github_user_email_address = NULL,
        email_domain_hostname_id = NULL,
        github_user_data = '{}'::jsonb,
        access_token_ciphertext = NULL,
        refresh_token_ciphertext = NULL,
        access_token_expires_at = NULL
    WHERE user_id = ${userId}
  `)
}
