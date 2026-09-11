import * as OTPAuth from 'otpauth'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PublicTotpAuthenticator, TotpSetupData } from './types.mts'

export async function createTotpAuthenticator(
  userId: string,
  name: string,
): Promise<TotpSetupData> {
  assert(name.length >= 1 && name.length <= 100 && name.trim() === name, 422, 'Invalid name')

  const secret = new OTPAuth.Secret({ size: 20 })
  const totp = new OTPAuth.TOTP({
    issuer: 'Voucha',
    label: name,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })

  await using query = await beginTransaction()
  await query(sql`/* createTotpAuthenticator */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const { rows } = await query<PublicTotpAuthenticator>(sql`/* createTotpAuthenticator */
      INSERT INTO user_totp_authenticators (user_id, secret_ciphertext, name)
      VALUES (${userId}, ${encryptSecret(secret.base32, getTotpSecretPurpose(userId))}, ${name})
      RETURNING id, name, created_at
    `)
  await query.commit()
  const authenticator = rows[0]
  if (!authenticator) throw new Error('createTotpAuthenticator: INSERT returned no rows')

  return {
    authenticator,
    secret: secret.base32,
    uri: totp.toString(),
  }
}

export function getTotpSecretPurpose(userId: string): string {
  return `totp-secret:${userId}`
}
