import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertBoundedText } from './territorial-fields.mts'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'

const JURISDICTION = 'eu_dsa'

export type EuCopyrightSupervisedComplaint = {
  id: string
  escalation_id: string
}

export async function recordEuCopyrightSupervisedComplaint(
  actor: PrivateUser,
  noticeId: string,
  input: { authorityReference: string; explanation: string },
): Promise<EuCopyrightSupervisedComplaint> {
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
    WHERE copyright_notice_id = ${noticeId} AND jurisdiction = ${JURISDICTION}
  `,
  )
  const receipt = receipts[0]
  assert(receipt, 404, 'EU copyright notice not found')
  assert(
    actor.id === receipt.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
    403,
    'Forbidden',
  )
  const { rows: existing } = await transaction<{ id: string }>(
    sql`/* recordEuCopyrightSupervisedComplaint:existing */
    SELECT id FROM copyright_eu_supervised_complaints
    WHERE copyright_notice_id = ${noticeId} AND jurisdiction = ${JURISDICTION}
      AND authority_reference = ${authorityReference}
  `,
  )
  assert(!existing[0], 409, 'That supervised complaint is already recorded')
  await lockCurrentCopyrightTerritorialPolicy(JURISDICTION, transaction)
  const { rows: complaints } = await transaction<{ id: string }>(
    sql`/* recordEuCopyrightSupervisedComplaint */
    INSERT INTO copyright_eu_supervised_complaints (
      copyright_notice_id, jurisdiction, recorded_by_id, authority_reference,
      explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${JURISDICTION}, ${actor.id}, ${authorityReference},
      ${encryptSecret(explanation, `copyright-eu-supervised:${noticeId}:${authorityReference}`)}
    )
    RETURNING id
  `,
  )
  const complaint = complaints[0]
  assert(complaint, 500, 'Failed to record EU supervised complaint')
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
  return { id: complaint.id, escalation_id: escalation.id }
}
