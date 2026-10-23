import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  insertTerritorialAcknowledgmentEscalationQuery,
  lockTerritorialAcknowledgmentQuery,
  updateTerritorialAcknowledgmentQuery,
} from './territorial-acknowledgment-sql.mts'
import type { TerritorialCopyrightJurisdiction } from './territorial-fields.mts'
import { territorialLabels } from './territorial-labels.mts'

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

function publicAcknowledgment(
  row: TerritorialCopyrightAcknowledgment,
): TerritorialCopyrightAcknowledgment {
  return {
    id: row.id,
    attempt_count: row.attempt_count,
    last_attempt_at: row.last_attempt_at,
    acknowledged_at: row.acknowledged_at,
    exhausted_at: row.exhausted_at,
    escalated: row.escalated,
  }
}

function decodeRetainedAcknowledgment(snapshot: unknown): TerritorialCopyrightAcknowledgment {
  assert(
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot),
    500,
    'Invalid retained territorial acknowledgment',
  )
  const row = snapshot as Record<string, unknown>
  assert(
    typeof row.id === 'string' &&
      typeof row.attempt_count === 'number' &&
      Number.isInteger(row.attempt_count) &&
      (row.last_attempt_at === null || typeof row.last_attempt_at === 'string') &&
      (row.acknowledged_at === null || typeof row.acknowledged_at === 'string') &&
      (row.exhausted_at === null || typeof row.exhausted_at === 'string') &&
      typeof row.escalated === 'boolean',
    500,
    'Invalid retained territorial acknowledgment',
  )
  const parseDate = (value: string | null): Date | null => (value === null ? null : new Date(value))
  const result = {
    id: row.id,
    attempt_count: row.attempt_count,
    last_attempt_at: parseDate(row.last_attempt_at),
    acknowledged_at: parseDate(row.acknowledged_at),
    exhausted_at: parseDate(row.exhausted_at),
    escalated: row.escalated,
  }
  assert(
    [result.last_attempt_at, result.acknowledged_at, result.exhausted_at].every(
      value => value === null || Number.isFinite(value.getTime()),
    ),
    500,
    'Invalid retained territorial acknowledgment dates',
  )
  return result
}

export async function recordTerritorialCopyrightAcknowledgment(
  actor: PrivateUser | null,
  noticeId: string,
  outcome: 'acknowledged' | 'failed',
  jurisdiction: TerritorialCopyrightJurisdiction,
): Promise<TerritorialCopyrightAcknowledgment> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<TerritorialAcknowledgmentRow>(
    lockTerritorialAcknowledgmentQuery(jurisdiction, noticeId),
  )
  const current = rows[0]
  if (!current && outcome === 'acknowledged') {
    const lookup = createHash('sha256').update(noticeId).digest()
    const { rows: retainedRows } = await transaction<{
      requester_user_sha256: Buffer | null
      response_snapshot: unknown
    }>(sql`
      /* getRetainedTerritorialAcknowledgment */
      SELECT requester_user_sha256, response_snapshot
      FROM copyright_territorial_acknowledgment_retained_identities
      WHERE notice_lookup_sha256 = ${lookup}`)
    const retained = retainedRows[0]
    if (retained) {
      const actorDigest = actor && createHash('sha256').update(actor.id).digest()
      assert(
        actor &&
          (currentUserCanReviewCopyrightNotices(actor) ||
            (retained.requester_user_sha256 &&
              actorDigest &&
              retained.requester_user_sha256.equals(actorDigest))),
        403,
        'Forbidden',
      )
      const acknowledgment = decodeRetainedAcknowledgment(retained.response_snapshot)
      assert(acknowledgment.acknowledged_at, 409, 'Acknowledgment is already terminal')
      await transaction.commit()
      return acknowledgment
    }
  }
  assert(current, 404, territorialLabels(jurisdiction).noticeNotFound)
  if (current.acknowledged_at && outcome === 'acknowledged') {
    await transaction.commit()
    return publicAcknowledgment(current)
  }
  assert(
    !current.acknowledged_at && !current.exhausted_at,
    409,
    'Acknowledgment is already terminal',
  )
  if (outcome === 'failed') {
    assert(actor && currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  } else {
    assert(
      (actor?.id ?? null) === current.requester_user_id ||
        (actor && currentUserCanReviewCopyrightNotices(actor)),
      403,
      'Forbidden',
    )
  }
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
  if (updated.acknowledged_at || updated.exhausted_at) {
    const lookup = createHash('sha256').update(noticeId).digest()
    const requesterDigest = current.requester_user_id
      ? createHash('sha256').update(current.requester_user_id).digest()
      : null
    await transaction(sql`/* retainTerritorialAcknowledgmentOutcome */
      INSERT INTO copyright_territorial_acknowledgment_retained_identities
        (notice_lookup_sha256, requester_user_sha256, response_snapshot)
      VALUES (${lookup}, ${requesterDigest},
        ${JSON.stringify(publicAcknowledgment(updated))}::jsonb)`)
  }
  await transaction.commit()
  return publicAcknowledgment(updated)
}
