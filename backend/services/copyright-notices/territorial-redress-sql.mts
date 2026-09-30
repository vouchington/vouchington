import sql from 'sql-template-strings'

export type TerritorialRedressId = 'eu' | 'uk'

export function selectTerritorialRedressParent(territory: TerritorialRedressId, noticeId: string) {
  if (territory === 'eu') {
    return sql`/* submitEuCopyrightRedress:statement */
    SELECT statement.id, receipt.requester_user_id
    FROM copyright_eu_statements_of_reasons statement
    JOIN copyright_eu_notice_receipts receipt ON receipt.copyright_notice_id = statement.copyright_notice_id
    WHERE statement.copyright_notice_id = ${noticeId}`
  }
  return sql`/* submitUkCopyrightRedress:review */
    SELECT review.id, receipt.requester_user_id
    FROM copyright_uk_reviews review
    JOIN copyright_uk_notice_receipts receipt ON receipt.copyright_notice_id = review.copyright_notice_id
    WHERE review.copyright_notice_id = ${noticeId}`
}

export function selectExistingTerritorialRedressRequest(
  territory: TerritorialRedressId,
  noticeId: string,
  actorId: string,
  idempotencyKey: string,
) {
  if (territory === 'eu') {
    return sql`/* submitEuCopyrightRedress:existing */
    SELECT id, copyright_notice_id FROM copyright_eu_redress_requests
    WHERE copyright_notice_id = ${noticeId} OR (
      submitted_by_user_id = ${actorId} AND idempotency_key = ${idempotencyKey}
    )`
  }
  return sql`/* submitUkCopyrightRedress:existing */
    SELECT id, copyright_notice_id FROM copyright_uk_redress_requests
    WHERE copyright_notice_id = ${noticeId} OR (
      submitted_by_user_id = ${actorId} AND idempotency_key = ${idempotencyKey}
    )`
}

export function insertTerritorialRedressRequest(
  territory: TerritorialRedressId,
  noticeId: string,
  parentId: string,
  actorId: string,
  idempotencyKey: string,
  explanationCiphertext: string,
) {
  if (territory === 'eu') {
    return sql`/* submitEuCopyrightRedress */
    INSERT INTO copyright_eu_redress_requests (
      copyright_notice_id, copyright_eu_statement_of_reasons_id, submitted_by_user_id,
      idempotency_key, explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${parentId}, ${actorId}, ${idempotencyKey}, ${explanationCiphertext}
    )
    RETURNING id`
  }
  return sql`/* submitUkCopyrightRedress */
    INSERT INTO copyright_uk_redress_requests (
      copyright_notice_id, copyright_uk_review_id, submitted_by_user_id,
      idempotency_key, explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${parentId}, ${actorId}, ${idempotencyKey}, ${explanationCiphertext}
    )
    RETURNING id`
}

export function selectTerritorialRedressRequest(
  territory: TerritorialRedressId,
  redressId: string,
  noticeId: string,
) {
  if (territory === 'eu') {
    return sql`/* recordEuCopyrightRedressDecision:request */
    SELECT id FROM copyright_eu_redress_requests
    WHERE id = ${redressId} AND copyright_notice_id = ${noticeId}`
  }
  return sql`/* recordUkCopyrightRedressDecision:request */
    SELECT id FROM copyright_uk_redress_requests
    WHERE id = ${redressId} AND copyright_notice_id = ${noticeId}`
}

export function selectExistingTerritorialRedressDecision(
  territory: TerritorialRedressId,
  redressId: string,
) {
  if (territory === 'eu') {
    return sql`/* recordEuCopyrightRedressDecision:existing */
    SELECT id FROM copyright_eu_redress_decisions
    WHERE copyright_eu_redress_request_id = ${redressId}`
  }
  return sql`/* recordUkCopyrightRedressDecision:existing */
    SELECT id FROM copyright_uk_redress_decisions
    WHERE copyright_uk_redress_request_id = ${redressId}`
}

export function insertTerritorialRedressDecision(
  territory: TerritorialRedressId,
  redressId: string,
  actorId: string,
  disposition: string,
  rationaleCiphertext: string,
) {
  if (territory === 'eu') {
    return sql`/* recordEuCopyrightRedressDecision */
    INSERT INTO copyright_eu_redress_decisions (
      copyright_eu_redress_request_id, decided_by_id, staff_disposition, rationale_ciphertext
    ) VALUES (
      ${redressId}, ${actorId}, ${disposition}, ${rationaleCiphertext}
    )
    RETURNING id, decided_at, staff_disposition`
  }
  return sql`/* recordUkCopyrightRedressDecision */
    INSERT INTO copyright_uk_redress_decisions (
      copyright_uk_redress_request_id, decided_by_id, staff_disposition, rationale_ciphertext
    ) VALUES (
      ${redressId}, ${actorId}, ${disposition}, ${rationaleCiphertext}
    )
    RETURNING id, decided_at, staff_disposition`
}
