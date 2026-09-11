import * as OTPAuth from 'otpauth'
import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { getTotpSecretPurpose } from './create.mts'

export async function verifyTotpCode(userId: string, code: string): Promise<boolean> {
  const { rows } = await read(sql`/* verifyTotpCode */
    SELECT id, secret_ciphertext
    FROM user_totp_authenticators
    WHERE user_id = ${userId} AND verified_at IS NOT NULL
  `)

  for (const row of rows) {
    const totp = new OTPAuth.TOTP({
      issuer: 'Voucha',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(
        decryptSecret(row.secret_ciphertext, getTotpSecretPurpose(userId)),
      ),
    })
    const delta = totp.validate({ token: code, window: 1 })
    if (delta !== null) return true
  }

  return false
}
