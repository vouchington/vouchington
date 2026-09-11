import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function sanitizeOAuthAccountPii(
  userId: string,
  query: TransactionQuery,
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  const { rows: facebookRows } = await query(sql`/* sanitizeOAuthAccountPii */
    UPDATE facebook_accounts
    SET user_id = NULL,
        facebook_user_email_address = NULL,
        facebook_user_data = '{}'::jsonb,
        access_token_ciphertext = NULL,
        access_token_expires_at = NULL
    WHERE user_id = ${userId}
    RETURNING facebook_user_id
  `)

  await query(sql`/* sanitizeOAuthAccountPii */
    UPDATE apple_accounts
    SET user_id = NULL,
        apple_user_email_address = NULL,
        apple_user_data = '{}'::jsonb
    WHERE user_id = ${userId}
  `)

  await query(sql`/* sanitizeOAuthAccountPii */
    UPDATE google_accounts
    SET user_id = NULL,
        google_user_email_address = NULL,
        google_user_data = '{}'::jsonb
    WHERE user_id = ${userId}
  `)

  const { rows: xRows } = await query(sql`/* sanitizeOAuthAccountPii */
    UPDATE x_accounts
    SET user_id = NULL,
        x_user_email_address = NULL,
        x_user_data = '{}'::jsonb,
        access_token_ciphertext = NULL,
        refresh_token_ciphertext = NULL,
        access_token_expires_at = NULL
    WHERE user_id = ${userId}
    RETURNING x_user_id
  `)

  await query(sql`/* sanitizeOAuthAccountPii */
    UPDATE linkedin_accounts
    SET user_id = NULL,
        linkedin_user_email_address = NULL,
        linkedin_user_data = '{}'::jsonb,
        access_token_ciphertext = NULL,
        refresh_token_ciphertext = NULL,
        access_token_expires_at = NULL
    WHERE user_id = ${userId}
  `)

  await query(sql`/* sanitizeOAuthAccountPii */
    UPDATE microsoft_accounts
    SET user_id = NULL,
        microsoft_user_email_address = NULL,
        microsoft_user_data = '{}'::jsonb,
        access_token_ciphertext = NULL,
        refresh_token_ciphertext = NULL,
        access_token_expires_at = NULL
    WHERE user_id = ${userId}
  `)

  const { rows: githubRows } = await query(sql`/* sanitizeOAuthAccountPii */
    UPDATE github_accounts
    SET user_id = NULL,
        github_user_email_address = NULL,
        github_user_data = '{}'::jsonb,
        access_token_ciphertext = NULL,
        refresh_token_ciphertext = NULL,
        access_token_expires_at = NULL
    WHERE user_id = ${userId}
    RETURNING github_user_id
  `)

  const facebookUserIds = (facebookRows as { facebook_user_id: string }[]).map(
    r => r.facebook_user_id,
  )
  const xUserIds = (xRows as { x_user_id: string }[]).map(r => r.x_user_id)
  const githubUserIds = (githubRows as { github_user_id: string }[]).map(r => r.github_user_id)

  if (facebookUserIds.length > 0) {
    await query(sql`/* sanitizeOAuthAccountPii */
      DELETE FROM facebook_friends
      WHERE facebook_user_id = ANY(${facebookUserIds}::text[])
    `)
  }

  if (xUserIds.length > 0) {
    await query(sql`/* sanitizeOAuthAccountPii */
      DELETE FROM x_friends
      WHERE x_user_id = ANY(${xUserIds}::text[])
    `)
  }

  if (githubUserIds.length > 0) {
    await query(sql`/* sanitizeOAuthAccountPii */
      DELETE FROM github_friends
      WHERE github_user_id = ANY(${githubUserIds}::text[])
    `)
  }
}
