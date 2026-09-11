import * as OTPAuth from 'otpauth'
import { beginTransaction, read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PublicTotpAuthenticator } from './types.mts'
import { getTotpSecretPurpose } from './create.mts'

export async function verifyTotpSetup(
  userId: string,
  authenticatorId: string,
  code: string,
): Promise<PublicTotpAuthenticator> {
  const { rows } = await read(sql`/* verifyTotpSetup */
    SELECT id, name, secret_ciphertext, verified_at, created_at
    FROM user_totp_authenticators
    WHERE id = ${authenticatorId} AND user_id = ${userId}
    LIMIT 1
  `)
  assert(rows.length > 0, 404, 'Authenticator not found')

  const row = rows[0]
  assert(row.verified_at == null, 422, 'Authenticator already verified')

  const totp = new OTPAuth.TOTP({
    issuer: 'Voucha',
    label: row.name,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(
      decryptSecret(row.secret_ciphertext, getTotpSecretPurpose(userId)),
    ),
  })

  const delta = totp.validate({ token: code, window: 1 })
  assert(delta !== null, 401, 'Invalid verification code')

  await using query = await beginTransaction()
  await query(sql`/* verifyTotpSetup */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const result = await query<PublicTotpAuthenticator>(sql`/* verifyTotpSetup */
      UPDATE user_totp_authenticators
      SET verified_at = NOW()
      WHERE id = ${authenticatorId} AND user_id = ${userId} AND verified_at IS NULL
      RETURNING id, name, created_at
    `)
  await query.commit()
  const updatedRows = result.rows
  // Guard against concurrent verify requests (both can pass the pre-check above)
  assert(updatedRows.length > 0, 422, 'Authenticator already verified')

  return updatedRows[0]
}
