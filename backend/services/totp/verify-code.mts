import * as OTPAuth from 'otpauth'
import { write, type TransactionQuery, type QueryExecutor } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { getTotpSecretPurpose } from './create.mts'

export async function verifyTotpCode(
  userId: string,
  code: string,
  options: { now?: number; query?: TransactionQuery } = {},
): Promise<{ authenticatorId: string } | null> {
  const now = options.now ?? Date.now()
  const query = options.query ?? write
  const { rows } = await query(sql`/* verifyTotpCode */
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
  if (candidates.length === 0) return null
  return consumeTotpTimeSteps(userId, candidates, query)
}

async function consumeTotpTimeSteps(
  userId: string,
  candidates: { id: string; timeStep: number }[],
  query: QueryExecutor,
): Promise<{ authenticatorId: string } | null> {
  const { rows } = await query<{ id: string }>(sql`/* consumeTotpTimeSteps */
    UPDATE user_totp_authenticators AS authenticator
    SET last_used_time_step = candidate.time_step
    FROM unnest(${candidates.map(candidate => candidate.id)}::uuid[], ${candidates.map(candidate => candidate.timeStep)}::bigint[]) AS candidate(id, time_step)
    WHERE authenticator.id = candidate.id AND authenticator.user_id = ${userId}
      AND authenticator.verified_at IS NOT NULL
      AND (authenticator.last_used_time_step IS NULL OR authenticator.last_used_time_step < candidate.time_step)
    RETURNING authenticator.id
  `)
  return rows[0] ? { authenticatorId: rows[0].id } : null
}
