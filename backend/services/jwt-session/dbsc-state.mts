import { randomBytes } from 'node:crypto'
import { beginTransaction, registerPostCommitAction } from '@data-stores/psql'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getAndDelete } from '@data-stores/valkey/idempotency-key'
import { TimeUnit } from '@valkey/valkey-glide'
import sql from 'sql-template-strings'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { SESSION_REFRESH_REUSED } from '@modules/on-error/error-codes'
import { revokeAuthenticatedSession } from './user-session-revocation.mts'
import { revokeSessionKey } from './session-revocation-keys.mts'
import {
  assertActiveDeviceAuthority,
  lockSessionDeviceAuthority,
  readSessionDeviceAuthority,
  type SessionDeviceAuthorityRow,
} from './device-authority.mts'
import {
  parseDeviceBoundSessionBinding,
  type DeviceBoundSessionBinding,
  type WebSessionAuthority,
  type DbscChallenge,
} from './dbsc-state-schema.mts'
import { sessionAuthorityRequired } from './dbsc-errors.mts'

export type { WebSessionAuthority, DbscChallenge } from './dbsc-state-schema.mts'
export { sessionAuthorityRequired } from './dbsc-errors.mts'

const CHALLENGE_PREFIX = 'voucha:dbsc-challenge:'
export const CHALLENGE_SECONDS = 300

export interface WebSessionAuthorityIdentity {
  uid: string
  did: string
  sid: string
  uaHash: string
  ja4Hash?: string
  deviceExpiresAt: number
  deviceIssuedAt: number
  deviceTokenDigest: string
}

export async function readWebSessionAuthority(
  expected: WebSessionAuthorityIdentity,
): Promise<{ authority: WebSessionAuthority; raw: string }> {
  const row = await readSessionDeviceAuthority(expected.sid)
  const authority = authorityForRow(row, expected)
  if (row!.device_token_digest !== expected.deviceTokenDigest) {
    await revokeAuthenticatedSession(expected.uid, expected.sid)
    throw reusedDeviceCredential()
  }
  return { authority, raw: authoritySnapshot(row!, authority) }
}

export async function issueDbscChallenge(challenge: DbscChallenge): Promise<string> {
  const nonce = randomBytes(32).toString('base64url')
  await sessionValkeyClient.set(getDbscChallengeKey(nonce), JSON.stringify(challenge), {
    expiry: { type: TimeUnit.Seconds, count: CHALLENGE_SECONDS },
  })
  return nonce
}

/** PostgreSQL owns the binding; Valkey holds only a consumable proof challenge. */
export async function consumeDbscChallenge(options: {
  nonce: string
  challenge: DbscChallenge
  expectedState: string
  expected: WebSessionAuthorityIdentity
  nextBinding?: DeviceBoundSessionBinding
}): Promise<'consumed' | 'missing' | 'changed'> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(options.nonce)) return 'missing'
  await using query = await beginTransaction()
  await lockSessionDeviceAuthority(query, options.expected.uid, options.expected.sid)
  const row = await readSessionDeviceAuthority(options.expected.sid, query, true)
  const authority = authorityForRow(row, options.expected)
  if (row!.device_token_digest !== options.expected.deviceTokenDigest) {
    await query(sql`/* consumeDbscChallenge */
      UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = ${options.expected.sid} AND revoked_at IS NULL`)
    registerPostCommitAction(query, () => revokeSessionKey(options.expected.sid))
    await query.commit()
    throw reusedDeviceCredential()
  }
  if (authoritySnapshot(row!, authority) !== options.expectedState) return 'changed'
  const value = await getAndDelete(getDbscChallengeKey(options.nonce), {
    client: sessionValkeyClient,
  })
  if (value === null || value !== JSON.stringify(options.challenge)) return 'missing'
  if (options.nextBinding) {
    await query(sql`/* consumeDbscChallenge */
      UPDATE user_sessions
      SET device_bound_session_binding = ${JSON.stringify(options.nextBinding)}::jsonb
      WHERE id = ${options.expected.sid} AND user_id = ${options.expected.uid}
        AND revoked_at IS NULL AND device_bound_session_binding IS NULL`)
  }
  await query.commit()
  return 'consumed'
}

export function getDbscChallengeKey(nonce: string): string {
  return `${CHALLENGE_PREFIX}${nonce}`
}

function authorityForRow(
  row: SessionDeviceAuthorityRow | null,
  expected: WebSessionAuthorityIdentity,
): WebSessionAuthority {
  assertActiveDeviceAuthority(row, expected)
  const binding = row.device_token_binding
  if (
    binding?.client !== 'web' ||
    !row.device_token_issued_at ||
    !row.device_token_digest ||
    !row.device_token_encrypted ||
    binding.ua_hash !== expected.uaHash ||
    binding.ja4_hash !== expected.ja4Hash ||
    Math.floor(row.expires_at.getTime() / 1000) !== expected.deviceExpiresAt ||
    Math.floor(row.device_token_issued_at.getTime() / 1000) !== expected.deviceIssuedAt
  )
    throw sessionAuthorityRequired()
  const deviceBound =
    row.device_bound_session_binding === null
      ? null
      : parseDeviceBoundSessionBinding(row.device_bound_session_binding)
  return {
    uid: row.user_id,
    did: row.device_id,
    sid: row.id,
    deviceExpiresAt: expected.deviceExpiresAt,
    deviceIssuedAt: expected.deviceIssuedAt,
    client: 'web',
    uaHash: binding.ua_hash,
    ...(binding.ja4_hash && { ja4Hash: binding.ja4_hash }),
    kind: deviceBound ? 'bound' : 'unbound',
    ...(deviceBound && { origin: deviceBound.origin, publicKey: deviceBound.publicKey }),
  }
}

function authoritySnapshot(row: SessionDeviceAuthorityRow, authority: WebSessionAuthority): string {
  return JSON.stringify({
    authority,
    digest: row.device_token_digest,
    binding: row.device_bound_session_binding,
  })
}

function reusedDeviceCredential(): Error {
  return createCodedError(
    401,
    'Device credential was already used for renewal',
    SESSION_REFRESH_REUSED,
  )
}
