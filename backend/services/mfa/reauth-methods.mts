import { read } from '@data-stores/psql'

export async function getAccountReAuthMethods(currentUserId: string): Promise<{
  has_email: boolean
  has_totp: boolean
  has_passkey: boolean
}> {
  const { rows } = await read<{ has_email: boolean; has_totp: boolean; has_passkey: boolean }>(
    `/* getAccountReAuthMethods */ SELECT
       EXISTS (SELECT 1 FROM user_email_addresses WHERE user_id = $1 AND is_primary = TRUE) AS has_email,
       EXISTS (SELECT 1 FROM user_totp_authenticators WHERE user_id = $1 AND verified_at IS NOT NULL) AS has_totp,
       EXISTS (SELECT 1 FROM user_passkeys WHERE user_id = $1) AS has_passkey
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [currentUserId],
  )
  return rows[0] ?? { has_email: false, has_totp: false, has_passkey: false }
}
