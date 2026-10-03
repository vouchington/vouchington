import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  insertTerritorialAcknowledgmentEscalationQuery,
  lockTerritorialAcknowledgmentQuery,
  updateTerritorialAcknowledgmentQuery,
} from './territorial-acknowledgment-sql.mts'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'
import { territorialLabels } from './territorial-labels.mts'
import { lockCurrentCopyrightJurisdictionPolicy } from './jurisdiction-policy.mts'

export type TerritorialCopyrightAcknowledgment = {
  id: string
  attempt_count: number
  last_attempt_at: Date | null
  acknowledged_at: Date | null
  exhausted_at: Date | null
  escalated: boolean
}

type TerritorialAcknowledgmentRow = TerritorialCopyrightAcknowledgment & {
  requester_user_id: string | null
}

export async function recordTerritorialCopyrightAcknowledgment(
  actor: PrivateUser,
  noticeId: string,
  outcome: 'acknowledged' | 'failed',
  jurisdiction: TerritorialCopyrightJurisdiction,
): Promise<TerritorialCopyrightAcknowledgment> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<TerritorialAcknowledgmentRow>(
    lockTerritorialAcknowledgmentQuery(jurisdiction, noticeId),
  )
  const current = rows[0]
  assert(current, 404, territorialLabels(jurisdiction).noticeNotFound)
  if (current.acknowledged_at && outcome === 'acknowledged') {
    await transaction.commit()
    return current
  }
  assert(
    !current.acknowledged_at && !current.exhausted_at,
    409,
    'Acknowledgment is already terminal',
  )
  if (outcome === 'failed') {
    assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  } else {
    assert(
      actor.id === current.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
      403,
      'Forbidden',
    )
  }
  await lockCurrentCopyrightJurisdictionPolicy(jurisdiction, transaction)
  const { rows: updatedRows } = await transaction<TerritorialCopyrightAcknowledgment>(
    updateTerritorialAcknowledgmentQuery(current.id, outcome),
  )
  const updated = updatedRows[0]
  assert(updated, 409, 'Acknowledgment is already terminal')
  if (updated.exhausted_at) {
    await transaction(
      insertTerritorialAcknowledgmentEscalationQuery(jurisdiction, noticeId, updated.id),
    )
    updated.escalated = true
  }
  await transaction.commit()
  return updated
}
