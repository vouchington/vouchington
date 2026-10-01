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
} from './territorial-fields.mts'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'
import {
  insertTerritorialRedressDecision,
  insertTerritorialRedressRequest,
  selectExistingTerritorialRedressDecision,
  selectExistingTerritorialRedressRequest,
  selectTerritorialRedressParent,
  selectTerritorialRedressRequest,
  type TerritorialRedressId,
} from './territorial-redress-sql.mts'

export type { TerritorialRedressId }

export type TerritorialCopyrightRedressRequest = { id: string; is_duplicate: boolean }
export type TerritorialCopyrightRedressDecision = {
  id: string
  decided_at: Date
  staff_disposition: CopyrightStaffDisposition
}

type TerritorialRedressTerritory =
  | {
      policy: 'eu_dsa'
      parentNotFound: 'EU statement of reasons not found'
      requestFailed: 'Failed to record EU redress request'
      requestNotFound: 'EU redress request not found'
      decisionExists: 'EU redress decision already exists'
      decisionFailed: 'Failed to record EU redress decision'
      requestPurpose: 'copyright-eu-redress'
      decisionPurpose: 'copyright-eu-redress-decision'
    }
  | {
      policy: 'uk'
      parentNotFound: 'UK copyright review not found'
      requestFailed: 'Failed to record UK redress request'
      requestNotFound: 'UK redress request not found'
      decisionExists: 'UK redress decision already exists'
      decisionFailed: 'Failed to record UK redress decision'
      requestPurpose: 'copyright-uk-redress'
      decisionPurpose: 'copyright-uk-redress-decision'
    }

const TERRITORIES = {
  eu: {
    policy: 'eu_dsa',
    parentNotFound: 'EU statement of reasons not found',
    requestFailed: 'Failed to record EU redress request',
    requestNotFound: 'EU redress request not found',
    decisionExists: 'EU redress decision already exists',
    decisionFailed: 'Failed to record EU redress decision',
    requestPurpose: 'copyright-eu-redress',
    decisionPurpose: 'copyright-eu-redress-decision',
  },
  uk: {
    policy: 'uk',
    parentNotFound: 'UK copyright review not found',
    requestFailed: 'Failed to record UK redress request',
    requestNotFound: 'UK redress request not found',
    decisionExists: 'UK redress decision already exists',
    decisionFailed: 'Failed to record UK redress decision',
    requestPurpose: 'copyright-uk-redress',
    decisionPurpose: 'copyright-uk-redress-decision',
  },
} as const satisfies Record<TerritorialRedressId, TerritorialRedressTerritory>

export async function submitTerritorialCopyrightRedress(
  actor: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  explanation: string,
  territoryId: TerritorialRedressId,
): Promise<TerritorialCopyrightRedressRequest> {
  const territory = TERRITORIES[territoryId]
  assertIdempotencyKey(idempotencyKey)
  const text = assertBoundedText(explanation, 50_000, 'explanation is required')
  await using transaction = await beginTransaction()
  const { rows: parents } = await transaction<{
    id: string
    requester_user_id: string | null
  }>(selectTerritorialRedressParent(territoryId, noticeId))
  const parent = parents[0]
  assert(parent, 404, territory.parentNotFound)
  assert(
    actor.id === parent.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
    403,
    'Forbidden',
  )
  const { rows: existing } = await transaction<{ id: string; copyright_notice_id: string }>(
    selectExistingTerritorialRedressRequest(territoryId, noticeId, actor.id, idempotencyKey),
  )
  if (existing[0]) {
    assert(existing[0].copyright_notice_id === noticeId, 409, 'Idempotency-Key was reused')
    await transaction.commit()
    return { id: existing[0].id, is_duplicate: true }
  }
  await lockCurrentCopyrightTerritorialPolicy(territory.policy, transaction)
  const { rows } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      territoryId,
      noticeId,
      parent.id,
      actor.id,
      idempotencyKey,
      encryptSecret(text, `${territory.requestPurpose}:${idempotencyKey}`),
    ),
  )
  const created = rows[0]
  assert(created, 500, territory.requestFailed)
  await transaction.commit()
  return { id: created.id, is_duplicate: false }
}

export async function recordTerritorialCopyrightRedressDecision(
  actor: PrivateUser,
  noticeId: string,
  redressId: string,
  input: { disposition: unknown; rationale: string },
  territoryId: TerritorialRedressId,
): Promise<TerritorialCopyrightRedressDecision> {
  const territory = TERRITORIES[territoryId]
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  const disposition = assertStaffDisposition(input.disposition)
  const rationale = assertBoundedText(input.rationale, 50_000, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: requests } = await transaction<{ id: string }>(
    selectTerritorialRedressRequest(territoryId, redressId, noticeId),
  )
  assert(requests[0], 404, territory.requestNotFound)
  const { rows: existing } = await transaction<{ id: string }>(
    selectExistingTerritorialRedressDecision(territoryId, redressId),
  )
  assert(!existing[0], 409, territory.decisionExists)
  await lockCurrentCopyrightTerritorialPolicy(territory.policy, transaction)
  const { rows } = await transaction<TerritorialCopyrightRedressDecision>(
    insertTerritorialRedressDecision(
      territoryId,
      redressId,
      actor.id,
      disposition,
      encryptSecret(rationale, `${territory.decisionPurpose}:${redressId}`),
    ),
  )
  const created = rows[0]
  assert(created, 500, territory.decisionFailed)
  await transaction.commit()
  return created
}
