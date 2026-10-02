import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

export function selectTerritorialRedressParent(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
) {
  return sql`/* submitTerritorialCopyrightRedress:decision */
    SELECT decision.id, receipt.requester_user_id
    FROM copyright_territorial_decisions decision
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = decision.copyright_notice_id
      AND receipt.jurisdiction = decision.jurisdiction
    WHERE decision.copyright_notice_id = ${noticeId} AND decision.jurisdiction = ${jurisdiction}`
}

export function selectExistingTerritorialRedressRequest(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  actorId: string,
  idempotencyKey: string,
) {
  return sql`/* submitTerritorialCopyrightRedress:existing */
    SELECT id, copyright_notice_id FROM copyright_territorial_redress_requests
    WHERE jurisdiction = ${jurisdiction} AND (
      copyright_notice_id = ${noticeId} OR (
        submitted_by_user_id = ${actorId} AND idempotency_key = ${idempotencyKey}
      )
    )`
}

export function insertTerritorialRedressRequest(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  decisionId: string,
  actorId: string,
  idempotencyKey: string,
  explanationCiphertext: string,
) {
  return sql`/* submitTerritorialCopyrightRedress */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id, submitted_by_user_id,
      idempotency_key, explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${jurisdiction}, ${decisionId}, ${actorId}, ${idempotencyKey},
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
    SELECT id FROM copyright_territorial_redress_requests
    WHERE id = ${redressId} AND copyright_notice_id = ${noticeId}
      AND jurisdiction = ${jurisdiction}`
}

export function selectExistingTerritorialRedressDecision(redressId: string) {
  return sql`/* recordTerritorialCopyrightRedressDecision:existing */
    SELECT id FROM copyright_territorial_redress_decisions
    WHERE copyright_territorial_redress_request_id = ${redressId}`
}

export function insertTerritorialRedressDecision(
  redressId: string,
  actorId: string,
  disposition: string,
  rationaleCiphertext: string,
) {
  return sql`/* recordTerritorialCopyrightRedressDecision */
    INSERT INTO copyright_territorial_redress_decisions (
      copyright_territorial_redress_request_id, decided_by_id, staff_disposition,
      rationale_ciphertext
    ) VALUES (${redressId}, ${actorId}, ${disposition}, ${rationaleCiphertext})
    RETURNING id, decided_at, staff_disposition`
}
