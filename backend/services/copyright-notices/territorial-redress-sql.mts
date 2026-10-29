import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export function selectTerritorialRedressParent(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
) {
  return sql`/* submitTerritorialCopyrightRedress:decision */
    SELECT notice.current_territorial_decision_identity_id AS id,
      notice.territorial_decided_at AS decided_at,
      notice.territorial_decision_outcome AS outcome,
      notice.territorial_authorizing_assessment_identity_id AS authorizing_assessment_identity_id,
      receipt.requester_user_id
    FROM copyright_notices notice
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = notice.id AND receipt.jurisdiction = notice.jurisdiction
    WHERE notice.id = ${noticeId} AND notice.jurisdiction = ${jurisdiction}
      AND notice.current_territorial_decision_identity_id IS NOT NULL
    FOR UPDATE OF notice`
}

export function selectExistingTerritorialRedressRequest(
  jurisdiction: TerritorialCopyrightJurisdiction,
  decisionId: string,
  actorId: string,
  idempotencyKey: string,
) {
  return sql`/* submitTerritorialCopyrightRedress:existing */
    SELECT id, copyright_notice_id, copyright_territorial_decision_id
    FROM copyright_territorial_redress_requests
    WHERE jurisdiction = ${jurisdiction} AND submitted_by_id = ${actorId}
      AND (copyright_territorial_decision_id = ${decisionId}
        OR idempotency_key = ${idempotencyKey})`
}

export function insertTerritorialRedressRequest(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  decisionId: string,
  decisionOutcome: 'restrict' | 'no_action',
  authorizingAssessmentIdentityId: string | null,
  actorId: string | null,
  filedBy: 'notifier' | 'poster' | 'reviewer',
  idempotencyKey: string,
  explanationCiphertext: string,
) {
  return sql`/* submitTerritorialCopyrightRedress */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
      challenged_decision_outcome, authorizing_assessment_identity_id, submitted_by_id,
      filed_by, idempotency_key, explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${jurisdiction}, ${decisionId}, ${decisionOutcome},
      ${authorizingAssessmentIdentityId}, ${actorId}, ${filedBy}, ${idempotencyKey},
      ${explanationCiphertext}
    )
    RETURNING id`
}

export function selectTerritorialRedressRequest(
  jurisdiction: TerritorialCopyrightJurisdiction,
  redressId: string,
  noticeId: string,
) {
  return sql`/* recordTerritorialCopyrightRedressDecision:request */
    SELECT request.id, request.copyright_territorial_decision_id,
      notice.current_territorial_decision_identity_id = request.copyright_territorial_decision_id
        AS decision_is_live
    FROM copyright_territorial_redress_requests request
    JOIN copyright_notices notice ON notice.id = request.copyright_notice_id
    WHERE request.id = ${redressId} AND request.copyright_notice_id = ${noticeId}
      AND request.jurisdiction = ${jurisdiction} FOR UPDATE OF request`
}

export function selectExistingTerritorialRedressDecision(redressId: string) {
  return sql`/* recordTerritorialCopyrightRedressDecision:existing */
    SELECT current_staff_decision_identity_id AS id
    FROM copyright_territorial_redress_requests
    WHERE id = ${redressId} AND current_staff_decision_identity_id IS NOT NULL`
}

export function insertTerritorialRedressDecision(
  decisionId: string,
  redressId: string,
  actorId: string,
  disposition: string,
  rationaleCiphertext: string,
) {
  return sql`/* recordTerritorialCopyrightRedressDecision */
    INSERT INTO copyright_territorial_redress_decisions (
      id, copyright_territorial_redress_request_id, decided_by_id, staff_disposition,
      rationale_ciphertext
    ) VALUES (${decisionId}, ${redressId}, ${actorId}, ${disposition}, ${rationaleCiphertext})
    RETURNING id, decided_at, staff_disposition`
}
