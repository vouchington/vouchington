import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { encryptSecret, hashToken } from '@modules/token-secrets'
import { recordClaimantMisuseEvent } from './claimant-misuse-ledger.mts'
import { copyrightGuestCapabilityPurpose } from './guest-capabilities.mts'
import { revokeCopyrightGuestCapabilitiesForWithdrawal } from './guest-capability-withdrawal.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'

const guestFilingKinds = ['supplement', 'withdrawal', 'court_or_ccb_hold'] as const
type GuestFilingKind = (typeof guestFilingKinds)[number]

function guestFilingEvent(kind: GuestFilingKind): string {
  return `${kind}_received`
}

async function lockGuestCapability(
  transaction: OwnedTransaction,
  input: { noticeId: string; token: string; now: Date },
): Promise<string> {
  const { rows } = await transaction<{ id: string }>(
    sql`/* appendCopyrightGuestFiling:capability */
    SELECT capability.id FROM copyright_notice_guest_capabilities capability
    JOIN copyright_notices notice ON notice.id = capability.copyright_notice_id
    WHERE capability.copyright_notice_id = ${input.noticeId}
      AND notice.jurisdiction = 'us_dmca'
      AND capability.token_hash = ${hashToken(copyrightGuestCapabilityPurpose, input.token)}
      AND capability.revoked_at IS NULL
      AND capability.expires_at > ${input.now}
    FOR UPDATE OF capability
  `,
  )
  const capability = rows[0]
  assert(capability, 403, 'Copyright guest capability is not valid for this notice')
  return capability.id
}

// An unassessed hold denies delivery for every target, so each capability files at most one.
async function assertNoGuestCourtHold(transaction: OwnedTransaction, capabilityId: string) {
  const { rows } = await transaction<{ id: string }>(
    sql`/* appendCopyrightGuestFiling:existingCourtHold */
    SELECT id FROM copyright_notice_submissions
    WHERE copyright_notice_guest_capability_id = ${capabilityId}
      AND kind = 'court_or_ccb_hold'
    LIMIT 1
  `,
  )
  assert(!rows[0], 409, 'This guest capability already filed a court or CCB hold')
}

export async function appendCopyrightGuestFiling(input: {
  noticeId: string
  token: string
  now: Date
  kind: GuestFilingKind
  statement: string
}): Promise<{ id: string; kind: GuestFilingKind; received_at: Date }> {
  assert(input.statement.trim().length > 0, 422, 'Guest filing statement is required')
  assert(guestFilingKinds.includes(input.kind), 422, 'Unsupported guest filing')
  const submissionBody =
    input.kind === 'court_or_ccb_hold'
      ? JSON.stringify({ summary: input.statement })
      : input.statement
  const submissionId = uuidv7()
  await using transaction = await beginTransaction()
  const capabilityId = await lockGuestCapability(transaction, input)
  if (input.kind === 'court_or_ccb_hold') await assertNoGuestCourtHold(transaction, capabilityId)
  const { rows } = await transaction<{ id: string; kind: GuestFilingKind; received_at: Date }>(
    sql`/* appendCopyrightGuestFiling */
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, kind, received_at, source_kind, submitted_by_user_id,
      body_ciphertext, copyright_notice_guest_capability_id
    ) VALUES (
      ${submissionId}, ${input.noticeId}, ${input.kind}, ${input.now}, 'guest_form', NULL,
      ${encryptSecret(submissionBody, copyrightSubmissionPurpose(submissionId))}, ${capabilityId}
    )
    RETURNING id, kind, received_at
  `,
  )
  const submission = rows[0]
  assert(submission, 500, 'Copyright guest filing was not created')
  await transaction(sql`/* appendCopyrightGuestFiling:event */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, copyright_notice_submission_id
    ) VALUES (${input.noticeId}, ${guestFilingEvent(input.kind)}, ${submission.id})
  `)
  if (input.kind === 'court_or_ccb_hold') {
    await transaction(sql`/* appendCopyrightGuestFiling:urgent */
      INSERT INTO copyright_notice_urgent_filings (copyright_notice_submission_id, classified_at)
      VALUES (${submission.id}, ${input.now})
    `)
  }
  if (input.kind === 'withdrawal') {
    await recordClaimantMisuseEvent(transaction, {
      noticeId: input.noticeId,
      recordedAt: input.now,
      event: { outcome: 'notice_withdrawn', submissionId: submission.id },
    })
    await revokeCopyrightGuestCapabilitiesForWithdrawal(transaction, {
      noticeId: input.noticeId,
      revokedAt: input.now,
    })
  }
  await transaction.commit()
  return submission
}
