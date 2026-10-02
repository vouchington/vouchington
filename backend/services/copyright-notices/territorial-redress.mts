import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  assertBoundedText,
  assertIdempotencyKey,
  assertStaffDisposition,
  type CopyrightStaffDisposition,
  type TerritorialCopyrightJurisdiction,
} from './territorial-fields.mts'
import { territorialLabels } from './territorial-labels.mts'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'
import {
  insertTerritorialRedressDecision,
  insertTerritorialRedressRequest,
  selectExistingTerritorialRedressDecision,
  selectExistingTerritorialRedressRequest,
  selectTerritorialRedressParent,
  selectTerritorialRedressRequest,
} from './territorial-redress-sql.mts'

export type TerritorialCopyrightRedressRequest = { id: string; is_duplicate: boolean }
export type TerritorialCopyrightRedressDecision = {
  id: string
  decided_at: Date
  staff_disposition: CopyrightStaffDisposition
}

export async function submitTerritorialCopyrightRedress(
  actor: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  explanation: string,
  jurisdiction: TerritorialCopyrightJurisdiction,
): Promise<TerritorialCopyrightRedressRequest> {
  const labels = territorialLabels(jurisdiction)
  assertIdempotencyKey(idempotencyKey)
  const text = assertBoundedText(explanation, 50_000, 'explanation is required')
  await using transaction = await beginTransaction()
  const { rows: parents } = await transaction<{
    id: string
    requester_user_id: string | null
  }>(selectTerritorialRedressParent(jurisdiction, noticeId))
  const parent = parents[0]
  assert(parent, 404, labels.decisionNotFound)
  assert(
    actor.id === parent.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
    403,
    'Forbidden',
  )
  const { rows: existing } = await transaction<{ id: string; copyright_notice_id: string }>(
    selectExistingTerritorialRedressRequest(jurisdiction, noticeId, actor.id, idempotencyKey),
  )
  if (existing[0]) {
    assert(existing[0].copyright_notice_id === noticeId, 409, 'Idempotency-Key was reused')
    await transaction.commit()
    return { id: existing[0].id, is_duplicate: true }
  }
  await lockCurrentCopyrightTerritorialPolicy(jurisdiction, transaction)
  const { rows } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      jurisdiction,
      noticeId,
      parent.id,
      actor.id,
      idempotencyKey,
      encryptSecret(text, `${labels.redressPurpose}:${idempotencyKey}`),
    ),
  )
  const created = rows[0]
  assert(created, 500, labels.redressFailed)
  await transaction.commit()
  return { id: created.id, is_duplicate: false }
}

export async function recordTerritorialCopyrightRedressDecision(
  actor: PrivateUser,
  noticeId: string,
  redressId: string,
  input: { disposition: unknown; rationale: string },
  jurisdiction: TerritorialCopyrightJurisdiction,
): Promise<TerritorialCopyrightRedressDecision> {
  const labels = territorialLabels(jurisdiction)
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const disposition = assertStaffDisposition(input.disposition)
  const rationale = assertBoundedText(input.rationale, 50_000, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: requests } = await transaction<{ id: string }>(
    selectTerritorialRedressRequest(jurisdiction, redressId, noticeId),
  )
  assert(requests[0], 404, labels.redressNotFound)
  const { rows: existing } = await transaction<{ id: string }>(
    selectExistingTerritorialRedressDecision(redressId),
  )
  assert(!existing[0], 409, labels.redressDecisionExists)
  await lockCurrentCopyrightTerritorialPolicy(jurisdiction, transaction)
  const { rows } = await transaction<TerritorialCopyrightRedressDecision>(
    insertTerritorialRedressDecision(
      redressId,
      actor.id,
      disposition,
      encryptSecret(rationale, `${labels.redressDecisionPurpose}:${redressId}`),
    ),
  )
  const created = rows[0]
  assert(created, 500, labels.redressDecisionFailed)
  await transaction.commit()
  return created
}
