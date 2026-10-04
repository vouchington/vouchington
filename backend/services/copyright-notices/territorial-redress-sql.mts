import sql from 'sql-template-strings'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'

/** A territorial decision remains live until a successor cites it. */
export function territorialDecisionIsLiveSql(alias = 'decision'): ReturnType<typeof sql> {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error('Invalid territorial decision alias')
  return sql``.append(`NOT EXISTS (
    SELECT 1 FROM copyright_territorial_decisions successor
    WHERE successor.supersedes_decision_id = ${alias}.id
  )`)
}

export function selectTerritorialRedressParent(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
) {
  return sql`/* submitTerritorialCopyrightRedress:decision */
    SELECT decision.id, decision.decided_at, decision.outcome, receipt.requester_user_id
    FROM copyright_territorial_decisions decision
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = decision.copyright_notice_id
      AND receipt.jurisdiction = decision.jurisdiction
    WHERE decision.copyright_notice_id = ${noticeId} AND decision.jurisdiction = ${jurisdiction}
      AND `
    .append(territorialDecisionIsLiveSql())
    .append(sql` FOR UPDATE OF decision`)
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
    WHERE jurisdiction = ${jurisdiction} AND submitted_by_user_id = ${actorId}
      AND (copyright_territorial_decision_id = ${decisionId}
        OR idempotency_key = ${idempotencyKey})`
}

export function insertTerritorialRedressRequest(
  jurisdiction: TerritorialCopyrightJurisdiction,
  noticeId: string,
  decisionId: string,
  actorId: string | null,
  filedBy: 'notifier' | 'poster' | 'reviewer',
  idempotencyKey: string,
  explanationCiphertext: string,
) {
  return sql`/* submitTerritorialCopyrightRedress */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id, submitted_by_user_id,
      filed_by, idempotency_key, explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${jurisdiction}, ${decisionId}, ${actorId}, ${filedBy}, ${idempotencyKey},
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
    SELECT request.id, request.copyright_territorial_decision_id, `.append(
    territorialDecisionIsLiveSql(),
  ).append(sql` AS decision_is_live
    FROM copyright_territorial_redress_requests request
    JOIN copyright_territorial_decisions decision
      ON decision.id = request.copyright_territorial_decision_id
    WHERE request.id = ${redressId} AND request.copyright_notice_id = ${noticeId}
      AND request.jurisdiction = ${jurisdiction} FOR UPDATE OF request`)
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
