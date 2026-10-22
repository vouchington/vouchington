import { beginTransaction } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertBoundedText, assertIdempotencyKey } from './territorial-fields.mts'

const JURISDICTION = 'eu_dsa'

export type EuCopyrightSupervisedComplaint = {
  id: string
  escalation_id: string
  is_duplicate: boolean
}

export async function recordEuCopyrightSupervisedComplaint(
  actor: PrivateUser,
  noticeId: string,
  input: { idempotencyKey: string; authorityReference: string; explanation: string },
): Promise<EuCopyrightSupervisedComplaint> {
  assertIdempotencyKey(input.idempotencyKey)
  const authorityReference = assertBoundedText(
    input.authorityReference,
    200,
    'authority_reference is required',
  )
  const explanation = assertBoundedText(input.explanation, 50_000, 'explanation is required')
  await using transaction = await beginTransaction()
  const { rows: receipts } = await transaction<{ requester_user_id: string | null }>(
    sql`/* recordEuCopyrightSupervisedComplaint:receipt */
    SELECT requester_user_id FROM copyright_territorial_notice_receipts
    WHERE copyright_notice_id = ${noticeId} AND jurisdiction = ${JURISDICTION} FOR UPDATE
  `,
  )
  const receipt = receipts[0]
  assert(receipt, 404, 'EU copyright notice not found')
  assert(
    actor.id === receipt.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
    403,
    'Forbidden',
  )
  const { rows: complaints } = await transaction<{ id: string }>(
    sql`/* recordEuCopyrightSupervisedComplaint */
    INSERT INTO copyright_eu_supervised_complaints (
      copyright_notice_id, jurisdiction, recorded_by_id, idempotency_key, authority_reference,
      explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${JURISDICTION}, ${actor.id}, ${input.idempotencyKey}, ${authorityReference},
      ${encryptSecret(explanation, `copyright-eu-supervised:${noticeId}:${authorityReference}`)}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `,
  )
  const complaint = complaints[0]
  if (!complaint) {
    const { rows: existing } = await transaction<{
      id: string
      copyright_notice_id: string
      authority_reference: string
      explanation_ciphertext: string
      escalation_id: string
    }>(sql`/* recordEuCopyrightSupervisedComplaint:replay */
      SELECT complaint.id, complaint.copyright_notice_id, complaint.authority_reference,
        complaint.explanation_ciphertext, escalation.id AS escalation_id
      FROM copyright_eu_supervised_complaints complaint
      JOIN copyright_territorial_escalations escalation
        ON escalation.copyright_eu_supervised_complaint_id = complaint.id
      WHERE complaint.recorded_by_id = ${actor.id} AND complaint.jurisdiction = ${JURISDICTION}
        AND complaint.idempotency_key = ${input.idempotencyKey}
    `)
    const replay = existing[0]
    assert(
      replay &&
        replay.copyright_notice_id === noticeId &&
        replay.authority_reference === authorityReference &&
        decryptSecret(
          replay.explanation_ciphertext,
          `copyright-eu-supervised:${noticeId}:${authorityReference}`,
        ) === explanation,
      409,
      'Idempotency-Key was reused or that supervised complaint is already recorded',
    )
    await transaction.commit()
    return { id: replay.id, escalation_id: replay.escalation_id, is_duplicate: true }
  }
  const { rows: escalations } = await transaction<{ id: string }>(
    sql`/* recordEuCopyrightSupervisedComplaint:escalation */
    INSERT INTO copyright_territorial_escalations (
      copyright_notice_id, jurisdiction, copyright_eu_supervised_complaint_id
    ) VALUES (${noticeId}, ${JURISDICTION}, ${complaint.id})
    RETURNING id
  `,
  )
  const escalation = escalations[0]
  assert(escalation, 500, 'Failed to record EU supervised complaint')
  await transaction.commit()
  return { id: complaint.id, escalation_id: escalation.id, is_duplicate: false }
}
