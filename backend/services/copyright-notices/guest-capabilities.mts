import { randomBytes } from 'crypto'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { hashToken } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { createOutboundCopyrightCorrespondence } from './correspondence.mts'
import type { CopyrightNoticeSubmissionRecord } from './types.mts'

const guestCapabilityPurpose = 'copyright-guest-capability'

export async function issueCopyrightGuestCapability(input: {
  noticeId: string
  expiresAt: Date
}): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url')
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* issueCopyrightGuestCapability */
    INSERT INTO copyright_notice_guest_capabilities (copyright_notice_id, token_hash, expires_at)
    SELECT notice.id, ${hashToken(guestCapabilityPurpose, token)}, ${input.expiresAt}
    FROM copyright_notices notice
    WHERE notice.id = ${input.noticeId}
    RETURNING id
  `)
  const capability = rows[0]
  assert(capability, 404, 'Copyright notice was not found')
  await transaction.commit()
  return { id: capability.id, token }
}

export async function revokeCopyrightGuestCapability(input: {
  noticeId: string
  capabilityId: string
  revokedAt: Date
}): Promise<void> {
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
      AND token_hash = ${hashToken(guestCapabilityPurpose, input.token)}
      AND revoked_at IS NULL
      AND expires_at > ${input.now}
  `)
  await transaction.commit()
  return rows[0]?.id ?? null
}

const guestFilingKinds = ['supplement', 'withdrawal', 'court_or_ccb_hold'] as const
type GuestFilingKind = (typeof guestFilingKinds)[number]

function guestFilingEvent(kind: GuestFilingKind): string {
  return `${kind}_received`
}

export async function appendCopyrightGuestFiling(input: {
  noticeId: string
  token: string
  now: Date
  kind: GuestFilingKind
  bodyCiphertext: string
}): Promise<CopyrightNoticeSubmissionRecord> {
  assert(guestFilingKinds.includes(input.kind), 422, 'Unsupported guest filing')
  await using transaction = await beginTransaction()
  const { rows: capabilities } = await transaction<{ id: string }>(
    sql`/* appendCopyrightGuestFiling:capability */
    SELECT id FROM copyright_notice_guest_capabilities
    WHERE copyright_notice_id = ${input.noticeId}
      AND token_hash = ${hashToken(guestCapabilityPurpose, input.token)}
      AND revoked_at IS NULL
      AND expires_at > ${input.now}
    FOR UPDATE
  `,
  )
  assert(capabilities[0], 403, 'Copyright guest capability is not valid for this notice')
  const { rows } = await transaction<CopyrightNoticeSubmissionRecord>(
    sql`/* appendCopyrightGuestFiling */
    INSERT INTO copyright_notice_submissions (
      copyright_notice_id, kind, received_at, source_kind, submitted_by_user_id, body_ciphertext
    ) VALUES (
      ${input.noticeId}, ${input.kind}, ${input.now}, 'guest_form', NULL, ${input.bodyCiphertext}
    )
    RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_user_id, body_ciphertext
  `,
  )
  const submission = rows[0]
  assert(submission, 500, 'Copyright guest filing was not created')
  await transaction(sql`/* appendCopyrightGuestFiling:event */
    INSERT INTO copyright_notice_lifecycle_events (
      copyright_notice_id, event_type, copyright_notice_submission_id
    ) VALUES (${input.noticeId}, ${guestFilingEvent(input.kind)}, ${submission.id})
  `)
  if (input.kind === 'court_or_ccb_hold') {
    await transaction(sql`/* appendCopyrightGuestFiling:urgent */
      INSERT INTO copyright_notice_urgent_filings (copyright_notice_submission_id, classified_at)
      VALUES (${submission.id}, ${input.now})
    `)
  }
  await transaction.commit()
  return submission
}

export async function requestCopyrightGuestInformation(input: {
  currentUser: PrivateUser
  noticeId: string
  capabilityId: string
  bodyCiphertext: string
}): Promise<void> {
  assert(
    currentUserCanReviewCopyrightNotices(input.currentUser),
    403,
    'Only copyright staff can request information',
  )
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(
    sql`/* requestCopyrightGuestInformation:capability */
    SELECT id FROM copyright_notice_guest_capabilities
    WHERE id = ${input.capabilityId} AND copyright_notice_id = ${input.noticeId}
    FOR UPDATE
  `,
  )
  assert(rows[0], 404, 'Copyright guest capability was not found')
  await transaction.commit()
  await createOutboundCopyrightCorrespondence({
    noticeId: input.noticeId,
    submissionId: null,
    correspondenceKind: 'request_information',
    compositionKind: 'staff',
    bodyCiphertext: input.bodyCiphertext,
    draftedById: input.currentUser.id,
  })
}
