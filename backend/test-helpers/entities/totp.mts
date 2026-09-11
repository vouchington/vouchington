import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import * as OTPAuth from 'otpauth'
import { v7 } from 'uuid'
import { encryptSecret } from '@modules/token-secrets'

export const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP' // well-known test secret // gitleaks:allow

// An explicit `id` lets tests engineer tie-key (equal-timestamp) fixtures: `created_at` on
// user_totp_authenticators is GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL, so it can
// only be controlled by crafting the UUIDv7 id itself (matching `msecs`, differing tail).
export async function insertTestTotpAuthenticator(userId: string, suffix: string, id?: string) {
  const { rows } = await write(sql`
    INSERT INTO user_totp_authenticators (id, user_id, secret_ciphertext, name, verified_at)
    VALUES (
      ${id ?? v7()},
      ${userId},
      ${encryptSecret(TEST_TOTP_SECRET, `totp-secret:${userId}`)},
      ${`Test Authenticator ${suffix}`},
      NOW()
    )
    RETURNING id, name, created_at
  `)
  return rows[0] as { id: string; name: string; created_at: Date }
}

export async function getTotpAuthenticatorVerifiedAt(id: string): Promise<Date | null> {
  const { rows } = await read(sql`
    SELECT verified_at FROM user_totp_authenticators WHERE id = ${id}
  `)
  return (rows[0]?.verified_at as Date | null) ?? null
}

export async function getTotpAuthenticatorSecretCiphertext(id: string): Promise<string | null> {
  const { rows } = await read(sql`
    SELECT secret_ciphertext FROM user_totp_authenticators WHERE id = ${id}
  `)
  return (rows[0]?.secret_ciphertext as string | null) ?? null
}

export async function getTotpAuthenticatorName(id: string): Promise<string | null> {
  const { rows } = await read(sql`
    SELECT name FROM user_totp_authenticators WHERE id = ${id}
  `)
  return (rows[0]?.name as string | null) ?? null
}

export async function totpAuthenticatorExists(id: string): Promise<boolean> {
  const { rows } = await read(sql`
    SELECT 1 FROM user_totp_authenticators WHERE id = ${id}
  `)
  return rows.length > 0
}

export function generateTestTotpCode(): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(TEST_TOTP_SECRET),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })
  return totp.generate()
}
