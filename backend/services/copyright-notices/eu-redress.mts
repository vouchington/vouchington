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

export type EuCopyrightRedressRequest = { id: string; is_duplicate: boolean }
export type EuCopyrightRedressDecision = {
  id: string
  decided_at: Date
  staff_disposition: CopyrightStaffDisposition
}

export async function submitEuCopyrightRedress(
  actor: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  explanation: string,
): Promise<EuCopyrightRedressRequest> {
  assertIdempotencyKey(idempotencyKey)
  const text = assertBoundedText(explanation, 50_000, 'explanation is required')
  await using transaction = await beginTransaction()
  const { rows: statements } = await transaction<{
    id: string
    requester_user_id: string | null
  }>(sql`/* submitEuCopyrightRedress:statement */
    SELECT statement.id, receipt.requester_user_id
    FROM copyright_eu_statements_of_reasons statement
    JOIN copyright_eu_notice_receipts receipt ON receipt.copyright_notice_id = statement.copyright_notice_id
    WHERE statement.copyright_notice_id = ${noticeId}
  `)
  const statement = statements[0]
  assert(statement, 404, 'EU statement of reasons not found')
  assert(
    actor.id === statement.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
    403,
    'Forbidden',
  )
  const { rows: existing } = await transaction<{ id: string; copyright_notice_id: string }>(
    sql`/* submitEuCopyrightRedress:existing */
    SELECT id, copyright_notice_id FROM copyright_eu_redress_requests
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
  await lockCurrentCopyrightTerritorialPolicy('eu_dsa', transaction)
  const { rows } = await transaction<{ id: string }>(sql`/* submitEuCopyrightRedress */
    INSERT INTO copyright_eu_redress_requests (
      copyright_notice_id, copyright_eu_statement_of_reasons_id, submitted_by_user_id,
      idempotency_key, explanation_ciphertext
    ) VALUES (
      ${noticeId}, ${statement.id}, ${actor.id}, ${idempotencyKey},
      ${encryptSecret(text, `copyright-eu-redress:${idempotencyKey}`)}
    )
    RETURNING id
  `)
  const created = rows[0]
  assert(created, 500, 'Failed to record EU redress request')
  await transaction.commit()
  return { id: created.id, is_duplicate: false }
}

export async function recordEuCopyrightRedressDecision(
  actor: PrivateUser,
  noticeId: string,
  redressId: string,
  input: { disposition: unknown; rationale: string },
): Promise<EuCopyrightRedressDecision> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const disposition = assertStaffDisposition(input.disposition)
  const rationale = assertBoundedText(input.rationale, 50_000, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: requests } = await transaction<{ id: string }>(
    sql`/* recordEuCopyrightRedressDecision:request */
    SELECT id FROM copyright_eu_redress_requests
    WHERE id = ${redressId} AND copyright_notice_id = ${noticeId}
  `,
  )
  assert(requests[0], 404, 'EU redress request not found')
  const { rows: existing } = await transaction<{ id: string }>(
    sql`/* recordEuCopyrightRedressDecision:existing */
    SELECT id FROM copyright_eu_redress_decisions
    WHERE copyright_eu_redress_request_id = ${redressId}
  `,
  )
  assert(!existing[0], 409, 'EU redress decision already exists')
  await lockCurrentCopyrightTerritorialPolicy('eu_dsa', transaction)
  const { rows } = await transaction<EuCopyrightRedressDecision>(
    sql`/* recordEuCopyrightRedressDecision */
    INSERT INTO copyright_eu_redress_decisions (
      copyright_eu_redress_request_id, decided_by_id, staff_disposition, rationale_ciphertext
    ) VALUES (
      ${redressId}, ${actor.id}, ${disposition},
      ${encryptSecret(rationale, `copyright-eu-redress-decision:${redressId}`)}
    )
    RETURNING id, decided_at, staff_disposition
  `,
  )
  const created = rows[0]
  assert(created, 500, 'Failed to record EU redress decision')
  await transaction.commit()
  return created
}
