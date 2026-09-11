import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type MfaStatus = {
  hasMfa: boolean
  passkeysCount: number
  totpCount: number
}

export async function getUserMfaStatus(userId: string, opts?: QueryOptions): Promise<MfaStatus> {
  const result = await read<{ passkeys_count: number; totp_count: number }>(
    sql`
    /* getUserMfaStatus */
    SELECT
      (SELECT COUNT(*)::int FROM user_passkeys WHERE user_id = ${userId}) AS passkeys_count,
      (SELECT COUNT(*)::int FROM user_totp_authenticators WHERE user_id = ${userId} AND verified_at IS NOT NULL) AS totp_count
  `,
    opts,
  )
  const row = result.rows[0]
  return {
    hasMfa: row.passkeys_count > 0 || row.totp_count > 0,
    passkeysCount: row.passkeys_count,
    totpCount: row.totp_count,
  }
}

export async function userHasMfa(userId: string): Promise<boolean> {
  const result = await read<{ has_mfa: boolean }>(sql`
    /* userHasMfa */
    SELECT EXISTS(
      SELECT 1 FROM user_passkeys WHERE user_id = ${userId}
      UNION ALL
      SELECT 1 FROM user_totp_authenticators WHERE user_id = ${userId} AND verified_at IS NOT NULL
      LIMIT 1
    ) AS has_mfa
  `)
  return result.rows[0].has_mfa
}
