import * as OTPAuth from 'otpauth'
import { write } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { getTotpSecretPurpose } from './create.mts'

export async function verifyTotpCode(
  userId: string,
  code: string,
  options: { now?: number } = {},
): Promise<boolean> {
  const now = options.now ?? Date.now()
  const { rows } = await write(sql`/* verifyTotpCode */
    SELECT id, secret_ciphertext
    FROM user_totp_authenticators
    WHERE user_id = ${userId} AND verified_at IS NOT NULL
  `)

  const candidates: { id: string; timeStep: number }[] = []
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
    const delta = totp.validate({ token: code, window: 1, timestamp: now })
    if (delta === null) continue
    const timeStep = Math.floor(now / (totp.period * 1000)) + delta
    candidates.push({ id: row.id, timeStep })
  }
  if (candidates.length === 0) return false
  return consumeTotpTimeSteps(userId, candidates)
}

async function consumeTotpTimeSteps(
  userId: string,
  candidates: { id: string; timeStep: number }[],
): Promise<boolean> {
  const { rowCount } = await write(sql`/* consumeTotpTimeSteps */
    UPDATE user_totp_authenticators AS authenticator
    SET last_used_time_step = candidate.time_step
    FROM unnest(${candidates.map(candidate => candidate.id)}::uuid[], ${candidates.map(candidate => candidate.timeStep)}::bigint[]) AS candidate(id, time_step)
    WHERE authenticator.id = candidate.id AND authenticator.user_id = ${userId}
      AND authenticator.verified_at IS NOT NULL
      AND (authenticator.last_used_time_step IS NULL OR authenticator.last_used_time_step < candidate.time_step)
  `)
  return (rowCount ?? 0) > 0
}
