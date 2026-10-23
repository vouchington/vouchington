import { isOptionalMfaVerifiedAt } from '@ts-shared/session-jwt'
import { createHash } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { SESSION_RELOGIN_REQUIRED } from '@modules/on-error/error-codes'
import { createCodedError } from '@modules/on-error/create-coded-error'
import type { SessionClientBinding } from './types.mts'

export interface SessionDeviceAuthorityRow {
  id: string
  user_id: string
  device_id: string
  expires_at: Date
  revoked_at: Date | null
  device_token_digest: string | null
  device_token_encrypted: string | null
  device_token_issued_at: Date | null
  device_token_binding: SessionClientBinding | null
  device_bound_session_binding: unknown
}

/** A primary, ID-scoped lookup; callers holding a transaction may lock the same authority row. */
export async function readSessionDeviceAuthority(
  sid: string,
  query: QueryExecutor = write,
  lock = false,
): Promise<SessionDeviceAuthorityRow | null> {
  const statement = sql`/* readSessionDeviceAuthority */
    SELECT s.id, s.user_id, s.device_id, s.expires_at, s.revoked_at,
      s.device_token_digest, s.device_token_encrypted, s.device_token_issued_at, s.device_token_binding, s.device_bound_session_binding
    FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sid} AND u.deleted_at IS NULL`
  if (lock) statement.append(' FOR UPDATE OF s')
  const { rows } = await query(statement)
  const row = (rows[0] as SessionDeviceAuthorityRow | undefined) ?? null
  if (row?.device_token_binding)
    row.device_token_binding = parseSessionClientBinding(row.device_token_binding)
  return row
}

export async function lockSessionDeviceAuthority(
  query: QueryExecutor,
  uid: string,
  sid: string,
): Promise<void> {
  // The user fence is shared with deletion and user-wide revocation; the SID fence also
  // serializes revocation before an initial session row exists.
  await query(sql`/* lockSessionDeviceAuthority:userFence */
    SELECT fn_lock_active_user_for_mutation(${uid})`)
  await query(sql`/* lockSessionDeviceAuthority:sessionFence */
    SELECT pg_advisory_xact_lock(hashtextextended(${sid}, 1))`)
}

export function assertActiveDeviceAuthority(
  row: SessionDeviceAuthorityRow | null,
  expected: { uid: string; did: string },
): asserts row is SessionDeviceAuthorityRow {
  if (
    !row ||
    row.user_id !== expected.uid ||
    row.device_id !== expected.did ||
    row.revoked_at ||
    row.expires_at.getTime() <= Date.now()
  )
    throw sessionReloginRequired()
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function sessionReloginRequired() {
  return createCodedError(
    401,
    'Session credentials must be renewed by signing in',
    SESSION_RELOGIN_REQUIRED,
  )
}

export function deviceTokenSecretPurpose(sid: string): string {
  return `user-session-device-token:${sid}`
}

function parseSessionClientBinding(value: unknown): SessionClientBinding {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw sessionReloginRequired()
  const binding = value as Record<string, unknown>
  if (Object.keys(binding).some(key => !['client', 'ua_hash', 'ja4_hash', 'mfa_at'].includes(key)))
    throw sessionReloginRequired()
  if (!isOptionalMfaVerifiedAt(binding.mfa_at)) throw sessionReloginRequired()
  const assurance = binding.mfa_at === undefined ? {} : { mfa_at: binding.mfa_at }
  if (
    binding.client === 'native' &&
    binding.ua_hash === undefined &&
    binding.ja4_hash === undefined
  )
    return { client: 'native', ...assurance }
  if (
    binding.client !== 'web' ||
    typeof binding.ua_hash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(binding.ua_hash) ||
    (binding.ja4_hash !== undefined &&
      (typeof binding.ja4_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(binding.ja4_hash)))
  )
    throw sessionReloginRequired()
  return {
    client: 'web',
    ...assurance,
    ua_hash: binding.ua_hash,
    ...(binding.ja4_hash !== undefined && { ja4_hash: binding.ja4_hash }),
  }
}
