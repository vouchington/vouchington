import { isOptionalMfaVerifiedAt } from '@ts-shared/session-jwt'
import type { SessionClientBinding } from './types.mts'
import {
  sessionReloginRequired,
  readSessionDeviceAuthority,
  assertActiveDeviceAuthority,
  lockSessionDeviceAuthority,
} from './device-authority.mts'
import type { TransactionQuery } from '@data-stores/psql/types'

/** Only a completed factor producer may supply proof for a newly authenticated SID. */
export function createSessionAssuranceBinding(
  binding: SessionClientBinding,
  mfaVerifiedAt: number | undefined,
  issuedAt: number,
): SessionClientBinding {
  assertOriginalMfaVerifiedAt(mfaVerifiedAt, issuedAt)
  const { mfa_at: _ignoredBindingProof, ...client } = binding
  return { ...client, ...(mfaVerifiedAt !== undefined && { mfa_at: mfaVerifiedAt }) }
}

export function assertOriginalMfaVerifiedAt(verifiedAt: unknown, issuedAt: number): void {
  if (!isOptionalMfaVerifiedAt(verifiedAt) || (verifiedAt !== undefined && verifiedAt > issuedAt))
    throw sessionReloginRequired()
}

export function filterSessionRoles(
  roles: readonly string[],
  mfaVerifiedAt?: number,
): readonly string[] {
  const verified = mfaVerifiedAt !== undefined && isOptionalMfaVerifiedAt(mfaVerifiedAt)
  return roles.filter(role => role !== 'administrator' || verified)
}

/** Distinguish an issued low-assurance credential from an unissued durable result reservation. */
export async function readOriginalSessionAssurance(
  currentUserId: string,
  identity: { sid: string; did: string },
  options: { query: TransactionQuery },
): Promise<{ mfaVerifiedAt?: number } | null> {
  await lockSessionDeviceAuthority(options.query, currentUserId, identity.sid)
  const row = await readSessionDeviceAuthority(identity.sid, options.query, true)
  if (!row) return null
  assertActiveDeviceAuthority(row, { uid: currentUserId, did: identity.did })
  if (!row.device_token_digest) return null
  if (!row.device_token_encrypted || !row.device_token_binding || !row.device_token_issued_at)
    throw sessionReloginRequired()
  assertOriginalMfaVerifiedAt(
    row.device_token_binding.mfa_at,
    Math.floor(row.device_token_issued_at.getTime() / 1000),
  )
  return { mfaVerifiedAt: row.device_token_binding.mfa_at }
}
