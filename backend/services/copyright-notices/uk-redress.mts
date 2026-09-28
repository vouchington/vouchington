import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  assertBoundedText,
  assertIdempotencyKey,
  assertStaffDisposition,
  type CopyrightStaffDisposition,
} from './territorial-fields.mts'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'

export type UkCopyrightRedressRequest = { id: string; is_duplicate: boolean }
export type UkCopyrightRedressDecision = {
  id: string
  decided_at: Date
  staff_disposition: CopyrightStaffDisposition
}

export async function submitUkCopyrightRedress(
  actor: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  explanation: string,
): Promise<UkCopyrightRedressRequest> {
  assertIdempotencyKey(idempotencyKey)
  const text = assertBoundedText(explanation, 50_000, 'explanation is required')
  await using transaction = await beginTransaction()
  const { rows: reviews } = await transaction<{
    id: string
    requester_user_id: string | null
  }>(sql`/* submitUkCopyrightRedress:review */
    SELECT review.id, receipt.requester_user_id
    FROM copyright_uk_reviews review
    JOIN copyright_uk_notice_receipts receipt ON receipt.copyright_notice_id = review.copyright_notice_id
    WHERE review.copyright_notice_id = ${noticeId}
  `)
  const review = reviews[0]
  assert(review, 404, 'UK copyright review not found')
  assert(
    actor.id === review.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
    403,
    'Forbidden',
  )
  const { rows: existing } = await transaction<{ id: string; copyright_notice_id: string }>(
    sql`/* submitUkCopyrightRedress:existing */
    SELECT id, copyright_notice_id FROM copyright_uk_redress_requests
    WHERE copyright_notice_id = ${noticeId} OR (
      submitted_by_user_id = ${actor.id} AND idempotency_key = ${idempotencyKey}
    )
  `,
  )
  if (existing[0]) {
    assert(existing[0].copyright_notice_id === noticeId, 409, 'Idempotency-Key was reused')
    await transaction.commit()
    return { id: existing[0].id, is_duplicate: true }
  }
  await lockCurrentCopyrightTerritorialPolicy('uk', transaction)
  const { rows } = await transaction<{ id: string }>(sql`/* submitUkCopyrightRedress */
    INSERT INTO copyright_uk_redress_requests (
      copyright_notice_id, copyright_uk_review_id, submitted_by_user_id,
      idempotency_key, explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${review.id}, ${actor.id}, ${idempotencyKey},
      ${encryptSecret(text, `copyright-uk-redress:${idempotencyKey}`)}
    )
    RETURNING id
  `)
  const created = rows[0]
  assert(created, 500, 'Failed to record UK redress request')
  await transaction.commit()
  return { id: created.id, is_duplicate: false }
}

export async function recordUkCopyrightRedressDecision(
  actor: PrivateUser,
  noticeId: string,
  redressId: string,
  input: { disposition: unknown; rationale: string },
): Promise<UkCopyrightRedressDecision> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const disposition = assertStaffDisposition(input.disposition)
  const rationale = assertBoundedText(input.rationale, 50_000, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: requests } = await transaction<{ id: string }>(
    sql`/* recordUkCopyrightRedressDecision:request */
    SELECT id FROM copyright_uk_redress_requests
    WHERE id = ${redressId} AND copyright_notice_id = ${noticeId}
  `,
  )
  assert(requests[0], 404, 'UK redress request not found')
  const { rows: existing } = await transaction<{ id: string }>(
    sql`/* recordUkCopyrightRedressDecision:existing */
    SELECT id FROM copyright_uk_redress_decisions
    WHERE copyright_uk_redress_request_id = ${redressId}
  `,
  )
  assert(!existing[0], 409, 'UK redress decision already exists')
  await lockCurrentCopyrightTerritorialPolicy('uk', transaction)
  const { rows } = await transaction<UkCopyrightRedressDecision>(
    sql`/* recordUkCopyrightRedressDecision */
    INSERT INTO copyright_uk_redress_decisions (
      copyright_uk_redress_request_id, decided_by_id, staff_disposition, rationale_ciphertext
    ) VALUES (
      ${redressId}, ${actor.id}, ${disposition},
      ${encryptSecret(rationale, `copyright-uk-redress-decision:${redressId}`)}
    )
    RETURNING id, decided_at, staff_disposition
  `,
  )
  const created = rows[0]
  assert(created, 500, 'Failed to record UK redress decision')
  await transaction.commit()
  return created
}
