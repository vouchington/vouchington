import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import {
  insertTerritorialRedressRequest,
  insertTerritorialRedressDecision,
} from '../services/copyright-notices/territorial-redress-sql.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from '../services/copyright-notices/staydown-registration.mts'
import { buildCopyrightClaimantDecisionDelivery } from '../services/copyright-notices/claimant-decision-notices.mts'
import { buildTerritorialRedressDecisionDelivery } from '../services/copyright-notices/territorial-redress-notices.mts'
import { createCopyrightStatementDeliveriesInTransaction } from '../services/copyright-notices/statement-delivery.mts'

/** Complete committed redress/complaint facts for reporting probes, preserving recipient notices. */
export async function seedEuContractReportingFacts(
  noticeId: string,
  claimant: PrivateUser,
  staff: PrivateUser,
) {
  await using transaction = await beginTransaction()
  const { rows: notices } = await transaction<{
    decision_id: string
    outcome: 'no_action'
    assessment: null
  }>(sql`
    /* seedEuContractReportingFacts:authority */
    SELECT current_territorial_decision_identity_id AS decision_id, territorial_decision_outcome AS outcome,
      territorial_authorizing_assessment_identity_id AS assessment
    FROM copyright_notices WHERE id = ${noticeId} AND jurisdiction = 'eu_dsa'`)
  const notice = notices[0]
  if (!notice?.decision_id || notice.outcome !== 'no_action' || notice.assessment !== null)
    throw new Error('Reporting fixture requires committed no-action authority')
  const key = crypto.randomUUID()
  const { rows: requests } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      'eu_dsa',
      noticeId,
      notice.decision_id,
      notice.outcome,
      null,
      claimant.id,
      'notifier',
      key,
      encryptSecret('Please review the restriction', `copyright-eu-redress:${key}`),
    ),
  )
  const request = requests[0]
  if (!request) throw new Error('Owned reporting redress missing')
  const { rows: identities } = await transaction<{ id: string }>(sql`
    /* seedEuContractReportingFacts:identity */
    INSERT INTO copyright_territorial_redress_decision_identities (copyright_territorial_redress_request_id)
    VALUES (${request.id}) RETURNING id`)
  const identity = identities[0]
  if (!identity) throw new Error('Owned redress decision identity missing')
  const rationale = 'Staff redress rationale'
  const ciphertext = encryptSecret(rationale, `copyright-eu-redress-decision:${request.id}`)
  const { rows: decisions } = await transaction<{
    id: string
    decided_at: Date
    staff_disposition: 'revoke'
  }>(insertTerritorialRedressDecision(identity.id, request.id, staff.id, 'revoke', ciphertext))
  const decision = decisions[0]
  if (!decision) throw new Error('Owned reporting redress decision missing')
  await transaction(sql`/* seedEuContractReportingFacts:current */
    UPDATE copyright_territorial_redress_requests SET current_staff_decision_identity_id = ${decision.id},
      staff_disposition = 'revoke', decided_at = ${decision.decided_at}, decided_by_id = ${staff.id},
      rationale_ciphertext = ${ciphertext} WHERE id = ${request.id}`)
  await applyCopyrightConfirmationConsequencesInTransaction(noticeId, transaction)
  const reversed = await buildCopyrightClaimantDecisionDelivery(
    { noticeId, event: 'reversed' },
    transaction,
  )
  const redress = await buildTerritorialRedressDecisionDelivery(
    { noticeId, redressId: request.id, disposition: 'revoke', rationale },
    transaction,
  )
  await createCopyrightStatementDeliveriesInTransaction(
    [...(reversed ? [reversed] : []), ...(redress ? [redress] : [])],
    transaction,
  )
  const reference = `DSC-${crypto.randomUUID()}`
  const { rows: complaints } = await transaction<{ id: string }>(sql`
    /* seedEuContractReportingFacts:complaint */
    INSERT INTO copyright_eu_supervised_complaints
      (copyright_notice_id, jurisdiction, recorded_by_id, idempotency_key, authority_reference, explanation_ciphertext)
    VALUES (${noticeId}, 'eu_dsa', ${claimant.id}, ${crypto.randomUUID()}, ${reference},
      ${encryptSecret('Complaint filed with the authority', `copyright-eu-supervised:${noticeId}:${reference}`)}) RETURNING id`)
  const complaint = complaints[0]
  if (!complaint) throw new Error('Owned supervised complaint missing')
  const { rows: escalations } = await transaction<{ id: string }>(sql`
    /* seedEuContractReportingFacts:escalation */
    INSERT INTO copyright_territorial_escalations
      (copyright_notice_id, jurisdiction, copyright_eu_supervised_complaint_id)
    VALUES (${noticeId}, 'eu_dsa', ${complaint.id}) RETURNING id`)
  const escalation = escalations[0]
  if (!escalation) throw new Error('Owned supervised escalation missing')
  await transaction(sql`/* seedEuContractReportingFacts:clock */
    UPDATE copyright_notices SET last_legal_activity_at = GREATEST(last_legal_activity_at, clock_timestamp())
    WHERE id = ${noticeId}`)
  await transaction.commit()
  return { decision, complaint: { ...complaint, escalation_id: escalation.id } }
}
