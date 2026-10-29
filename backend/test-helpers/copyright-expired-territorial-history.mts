import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

/** Reproduces the retained owner state after monthly decision and assessment history expires. */
export async function createTestExpiredTerritorialDecisionHistory(
  outcome: 'no_action' | 'restrict',
): Promise<{ noticeId: string; assessmentId: string | null; requestId: string; receivedAt: Date }> {
  await using transaction = await beginTransaction()
  const { rows: actors } = await transaction<{ id: string }>(sql`
    /* expiredTerritorialHistoryActor */ INSERT INTO users DEFAULT VALUES RETURNING id`)
  const actorId = actors[0]!.id
  const receivedAt = new Date()
  const { rows: notices } = await transaction<{ id: string }>(sql`
    /* expiredTerritorialHistoryNotice */
    INSERT INTO copyright_notices
      (jurisdiction, legal_basis, received_at, claimant_user_id,
       claimant_contact_ciphertext, work_description, policy_version)
    VALUES ('eu_dsa', 'copyright', ${receivedAt}, ${actorId}, 'contact', 'work', 'test')
    RETURNING id`)
  const noticeId = notices[0]!.id
  let assessmentId: string | null = null
  if (outcome === 'restrict') {
    const { rows: submissions } = await transaction<{ id: string }>(sql`
      /* expiredTerritorialHistorySubmission */
      INSERT INTO copyright_notice_submissions
        (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
      VALUES (${noticeId}, 'notice', ${receivedAt}, 'staff', 'body') RETURNING id`)
    const submissionId = submissions[0]!.id
    const { rows: assessments } = await transaction<{ id: string }>(sql`
      /* expiredTerritorialHistoryAssessmentIdentity */
      INSERT INTO copyright_notice_submission_assessment_identities
        (copyright_notice_id, copyright_notice_submission_id)
      VALUES (${noticeId}, ${submissionId}) RETURNING id`)
    assessmentId = assessments[0]!.id
    await transaction(sql`/* expiredTerritorialHistoryAssessmentOwner */
      UPDATE copyright_notice_submissions SET
        current_assessment_identity_id = ${assessmentId},
        current_assessment_is_substantially_compliant = true,
        current_assessed_at = ${receivedAt}, current_assessed_by_id = ${actorId}
      WHERE id = ${submissionId}`)
  }
  const decisionId = uuidv7()
  await transaction(sql`/* expiredTerritorialHistoryDecisionIdentity */
    INSERT INTO copyright_territorial_decision_identities
      (id, copyright_notice_id, jurisdiction)
    VALUES (${decisionId}, ${noticeId}, 'eu_dsa')`)
  await transaction(sql`/* expiredTerritorialHistoryDecisionOwner */
    UPDATE copyright_notices SET
      current_territorial_decision_identity_id = ${decisionId},
      territorial_authorizing_assessment_identity_id = ${assessmentId},
      territorial_decision_outcome = ${outcome}, territorial_decided_at = ${receivedAt},
      territorial_decided_by_id = ${actorId}, territorial_rationale_ciphertext = 'rationale',
      territorial_public_explanation_ciphertext = 'explanation'
    WHERE id = ${noticeId}`)
  const { rows: requests } = await transaction<{ id: string }>(sql`
    /* expiredTerritorialHistoryRedressRequest */
    INSERT INTO copyright_territorial_redress_requests
      (copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
       challenged_decision_outcome, authorizing_assessment_identity_id,
       submitted_by_id, filed_by, idempotency_key, explanation_ciphertext, received_at)
    VALUES (${noticeId}, 'eu_dsa', ${decisionId}, ${outcome}, ${assessmentId},
      ${actorId}, 'notifier', ${crypto.randomUUID()}, 'appeal', ${receivedAt})
    RETURNING id`)
  await transaction.commit()
  return { noticeId, assessmentId, requestId: requests[0]!.id, receivedAt }
}

export async function decideTestExpiredTerritorialRedress(
  requestId: string,
  disposition: 'maintain' | 'revoke',
): Promise<void> {
  const decisionId = uuidv7()
  await using transaction = await beginTransaction()
  const { rows: requests } = await transaction<{ submitted_by_id: string }>(sql`
    /* decideExpiredTerritorialRedressActor */
    SELECT submitted_by_id FROM copyright_territorial_redress_requests
    WHERE id = ${requestId} FOR UPDATE`)
  const actorId = requests[0]!.submitted_by_id
  await transaction(sql`/* decideExpiredTerritorialRedressIdentity */
    INSERT INTO copyright_territorial_redress_decision_identities
      (id, copyright_territorial_redress_request_id)
    VALUES (${decisionId}, ${requestId})`)
  await transaction(sql`/* decideExpiredTerritorialRedressOwner */
    UPDATE copyright_territorial_redress_requests SET
      current_staff_decision_identity_id = ${decisionId},
      staff_disposition = ${disposition}, decided_at = CURRENT_TIMESTAMP,
      decided_by_id = ${actorId}, rationale_ciphertext = 'reason'
    WHERE id = ${requestId}`)
  await transaction.commit()
}
