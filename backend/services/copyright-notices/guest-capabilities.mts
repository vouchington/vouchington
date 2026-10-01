import { randomBytes } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { hashToken } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export const copyrightGuestCapabilityPurpose = 'copyright-guest-capability'
export const copyrightGuestCapabilityMaxLifetimeMs = 30 * 24 * 60 * 60 * 1000

export async function issueCopyrightGuestCapability(input: {
  currentUser: PrivateUser
  noticeId: string
  expiresAt: Date
}): Promise<{ id: string; token: string }> {
  assert(
    currentUserCanReviewCopyrightNotices(input.currentUser),
    403,
    'Only copyright staff can issue guest capabilities',
  )
  const issuedAtMs = Date.now()
  assert(
    input.expiresAt.getTime() - issuedAtMs <= copyrightGuestCapabilityMaxLifetimeMs,
    422,
    'Guest capabilities expire within 30 days',
  )
  // The id's timestamp is the issue instant that the database expiry cap measures from.
  const id = uuidv7({ msecs: issuedAtMs })
  const token = randomBytes(32).toString('base64url')
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* issueCopyrightGuestCapability */
    INSERT INTO copyright_notice_guest_capabilities (
      id, copyright_notice_id, token_hash, issued_by_id, expires_at
    )
    SELECT ${id}, notice.id, ${hashToken(copyrightGuestCapabilityPurpose, token)},
      ${input.currentUser.id}, ${input.expiresAt}
    FROM copyright_notices notice
    WHERE notice.id = ${input.noticeId}
    RETURNING id
  `)
  assert(rows[0], 404, 'Copyright notice was not found')
  await transaction(sql`/* issueCopyrightGuestCapability:event */
    INSERT INTO copyright_notice_lifecycle_events (
      copyright_notice_id, event_type, actor_user_id, copyright_notice_guest_capability_id
    ) VALUES (${input.noticeId}, 'guest_capability_issued', ${input.currentUser.id}, ${id})
  `)
  await transaction.commit()
  return { id, token }
}

export async function revokeCopyrightGuestCapability(input: {
  currentUser: PrivateUser
  noticeId: string
  capabilityId: string
  revokedAt: Date
}): Promise<void> {
  assert(
    currentUserCanReviewCopyrightNotices(input.currentUser),
    403,
    'Only copyright staff can revoke guest capabilities',
  )
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* revokeCopyrightGuestCapability */
    UPDATE copyright_notice_guest_capabilities
    SET revoked_at = ${input.revokedAt}
    WHERE id = ${input.capabilityId}
      AND copyright_notice_id = ${input.noticeId}
      AND revoked_at IS NULL
    RETURNING id
  `)
  assert(rows[0], 404, 'Copyright guest capability was not found')
  await transaction(sql`/* revokeCopyrightGuestCapability:event */
    INSERT INTO copyright_notice_lifecycle_events (
      copyright_notice_id, event_type, actor_user_id, copyright_notice_guest_capability_id
    ) VALUES (
      ${input.noticeId}, 'guest_capability_revoked', ${input.currentUser.id}, ${input.capabilityId}
    )
  `)
  await transaction.commit()
}

export async function authorizeCopyrightGuestCapability(input: {
  noticeId: string
  token: string
  now: Date
}): Promise<string | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* authorizeCopyrightGuestCapability */
    SELECT id FROM copyright_notice_guest_capabilities
    WHERE copyright_notice_id = ${input.noticeId}
      AND token_hash = ${hashToken(copyrightGuestCapabilityPurpose, input.token)}
      AND revoked_at IS NULL
      AND expires_at > ${input.now}
  `)
  await transaction.commit()
  return rows[0]?.id ?? null
}
