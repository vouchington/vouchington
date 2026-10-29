import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

type Jurisdiction = 'eu_dsa' | 'uk'

type Fixture = { actorId: string; noticeId: string; otherNoticeId: string }

export async function createTerritorialDecisionConstraintFixture(
  query: TransactionQuery,
  jurisdiction: 'eu_dsa' | 'uk',
): Promise<Fixture> {
  const { rows } = await query<{
    actor_user_id: string
    notice_id: string
    other_notice_id: string
  }>(sql`/* territorialDecisionConstraintFixture */
    WITH actor AS (INSERT INTO users DEFAULT VALUES RETURNING id),
    first_notice AS (
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
        work_description, policy_version
      ) VALUES (${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, 'contact', 'work', 'test-v1')
      RETURNING id
    ), second_notice AS (
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
        work_description, policy_version
      ) VALUES (${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, 'contact', 'work', 'test-v1')
      RETURNING id
    )
    SELECT actor.id AS actor_user_id, first_notice.id AS notice_id,
      second_notice.id AS other_notice_id FROM actor, first_notice, second_notice`)
  const row = rows[0]
  if (!row) throw new Error('Missing territorial decision fixture')
  return { actorId: row.actor_user_id, noticeId: row.notice_id, otherNoticeId: row.other_notice_id }
}

export async function createTerritorialConstraintAssessment(
  query: TransactionQuery,
  noticeId: string,
  actorId: string | null,
  compliant: boolean,
): Promise<string> {
  const { rows: submissions } = await query<{
    id: string
  }>(sql`/* territorialDecisionConstraintSubmission */
    INSERT INTO copyright_notice_submissions (
      copyright_notice_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (${noticeId}, 'notice', CURRENT_TIMESTAMP, 'staff', 'body') RETURNING id`)
  const submissionId = submissions[0]?.id
  if (!submissionId) throw new Error('Missing submission fixture')
  const { rows: identities } = await query<{
    id: string
  }>(sql`/* territorialDecisionConstraintAssessmentIdentity */
    INSERT INTO copyright_notice_submission_assessment_identities (
      copyright_notice_id, copyright_notice_submission_id
    ) VALUES (${noticeId}, ${submissionId}) RETURNING id`)
  const assessmentId = identities[0]?.id
  if (!assessmentId) throw new Error('Missing assessment identity fixture')
  await query(sql`/* territorialDecisionConstraintAssessment */
    INSERT INTO copyright_notice_submission_assessments (
      id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
    ) VALUES (${assessmentId}, ${submissionId}, CURRENT_TIMESTAMP, ${actorId}, ${compliant})`)
  await query(sql`/* territorialDecisionConstraintAssessment:current */
    UPDATE copyright_notice_submissions
    SET current_assessment_identity_id = ${assessmentId},
      current_assessment_is_substantially_compliant = ${compliant},
      current_assessed_at = CURRENT_TIMESTAMP, current_assessed_by_id = ${actorId}
    WHERE id = ${submissionId}`)
  return assessmentId
}

export async function createTerritorialConstraintDecision(
  query: TransactionQuery,
  input: {
    noticeId: string
    jurisdiction: Jurisdiction
    actorId: string
    outcome: 'restrict' | 'no_action' | 'invalid'
    assessmentId?: string | null
    predecessorId?: string | null
    explanation?: string | null
  },
): Promise<string> {
  const decisionId = uuidv7()
  const { rows: notices } = await query<{ jurisdiction: Jurisdiction }>(sql`
    /* territorialDecisionConstraintDecisionNotice */
    SELECT jurisdiction FROM copyright_notices WHERE id = ${input.noticeId}`)
  await query(sql`/* territorialDecisionConstraintDecisionIdentity */
    INSERT INTO copyright_territorial_decision_identities
      (id, copyright_notice_id, jurisdiction)
    VALUES (${decisionId}, ${input.noticeId}, ${notices[0]!.jurisdiction})`)
  const { rows } = await query<{ id: string }>(sql`/* territorialDecisionConstraintDecision */
    INSERT INTO copyright_territorial_decisions (
      id, copyright_notice_id, jurisdiction, decided_by_id, outcome,
      copyright_notice_submission_assessment_id, supersedes_decision_id,
      automation_disclosure, rationale_ciphertext, public_explanation_ciphertext
    ) VALUES (
      ${decisionId}, ${input.noticeId}, ${input.jurisdiction}, ${input.actorId}, ${input.outcome},
      ${input.assessmentId === undefined ? null : input.assessmentId}, ${input.predecessorId === undefined ? null : input.predecessorId}, 'human', 'rationale',
      ${input.explanation === undefined ? 'Public explanation' : input.explanation}
    ) RETURNING id`)
  if (!rows[0]) throw new Error('Missing decision fixture')
  await query(sql`/* territorialDecisionConstraintDecision:current */
    UPDATE copyright_notices SET
      current_territorial_decision_identity_id = ${decisionId},
      territorial_decision_outcome = ${input.outcome},
      territorial_decided_at = CURRENT_TIMESTAMP, territorial_decided_by_id = ${input.actorId},
      territorial_authorizing_assessment_identity_id = ${input.assessmentId === undefined ? null : input.assessmentId},
      territorial_rationale_ciphertext = 'rationale',
      territorial_public_explanation_ciphertext = ${input.explanation === undefined ? 'Public explanation' : input.explanation}
    WHERE id = ${input.noticeId}`)
  return rows[0].id
}

export async function createTerritorialConstraintRevocation(
  query: TransactionQuery,
  noticeId: string,
  decisionId: string,
  actorId: string,
) {
  const { rows: requests } = await query<{
    id: string
  }>(sql`/* territorialDecisionConstraintRevoke:request */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
      challenged_decision_outcome, authorizing_assessment_identity_id,
      filed_by, submitted_by_id, idempotency_key, explanation_ciphertext
    ) SELECT ${noticeId}, 'eu_dsa', ${decisionId},
      notice.territorial_decision_outcome, notice.territorial_authorizing_assessment_identity_id,
      'notifier', ${actorId}, ${crypto.randomUUID()}, 'appeal'
    FROM copyright_notices notice WHERE notice.id = ${noticeId} RETURNING id`)
  const requestId = requests[0]?.id
  if (!requestId) throw new Error('Missing redress request fixture')
  const redressDecisionId = uuidv7()
  await query(sql`/* territorialDecisionConstraintRevoke:identity */
    INSERT INTO copyright_territorial_redress_decision_identities
      (id, copyright_territorial_redress_request_id)
    VALUES (${redressDecisionId}, ${requestId})`)
  await query(sql`/* territorialDecisionConstraintRevoke:history */
    INSERT INTO copyright_territorial_redress_decisions (
      id, copyright_territorial_redress_request_id, decided_by_id, staff_disposition,
      rationale_ciphertext
    ) VALUES (${redressDecisionId}, ${requestId}, ${actorId}, 'revoke', 'reversed')`)
  await query(sql`/* territorialDecisionConstraintRevoke:current */
    UPDATE copyright_territorial_redress_requests SET
      current_staff_decision_identity_id = ${redressDecisionId},
      staff_disposition = 'revoke', decided_at = CURRENT_TIMESTAMP,
      decided_by_id = ${actorId}, rationale_ciphertext = 'reversed'
    WHERE id = ${requestId}`)
}

export async function insertTerritorialConstraintDecision(
  transaction: TransactionQuery,
  noticeId: string,
  jurisdiction: Jurisdiction,
  actorId: string,
): Promise<string> {
  const decisionId = uuidv7()
  const { rows: notices } = await transaction<{ jurisdiction: Jurisdiction }>(sql`
    /* insertTerritorialDecisionNoticeJurisdiction */
    SELECT jurisdiction FROM copyright_notices WHERE id = ${noticeId}`)
  if (!notices[0]) throw new Error('missing territorial decision notice')
  await transaction(sql`/* insertTerritorialDecisionIdentity */
    INSERT INTO copyright_territorial_decision_identities (id, copyright_notice_id, jurisdiction)
    VALUES (${decisionId}, ${noticeId}, ${notices[0].jurisdiction})`)
  const { rows } = await transaction<{ id: string }>(sql`/* insertTerritorialDecision */
    INSERT INTO copyright_territorial_decisions (
      id, copyright_notice_id, jurisdiction, decided_by_id, outcome, automation_disclosure,
      rationale_ciphertext, public_explanation_ciphertext
    ) VALUES (${decisionId}, ${noticeId}, ${jurisdiction}, ${actorId}, 'no_action', 'human', 'rationale', 'explanation')
    RETURNING id
  `)
  const decision = rows[0]
  if (!decision) throw new Error('missing decision fixture')
  await transaction(sql`/* insertTerritorialDecisionCurrent */
    UPDATE copyright_notices SET current_territorial_decision_identity_id = ${decisionId},
      territorial_decision_outcome = 'no_action', territorial_decided_at = CURRENT_TIMESTAMP,
      territorial_decided_by_id = ${actorId},
      territorial_rationale_ciphertext = 'rationale',
      territorial_public_explanation_ciphertext = 'explanation'
    WHERE id = ${noticeId}`)
  return decision.id
}
