import { lockCopyrightNoticeLifetime } from './notice-lifetime.mts'
import { CopyrightReplayAdmission } from './replay-admission.mts'
import { findCopyrightReplayIdentity } from './replay-identity-store.mts'
import { recordCopyrightReplayIdentity } from './replay-identity-create.mts'
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
  const noticeLifetime = await lockCopyrightNoticeLifetime(transaction, noticeId)
  // Parent precedes the acknowledgment child, matching erasure and final purge.
  const { rows: owners } = await transaction(sql`/* lockTerritorialAcknowledgmentNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId}
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations work
        WHERE work.copyright_notice_identity_id = ${noticeId} AND work.erasure_started_at IS NOT NULL) FOR UPDATE`)
  const replayInput = {
    family: 'territorial_acknowledgment' as const,
    jurisdiction,
    identity: noticeId,
    requester: actor?.id ?? '',
    request: noticeId,
  }
  const replayAdmission =
    outcome === 'acknowledged'
      ? await CopyrightReplayAdmission.open(transaction, replayInput, noticeLifetime)
      : null
  if (replayAdmission) {
    const retained = await findCopyrightReplayIdentity(replayAdmission)
    if (retained) {
      const replay = await retained.replay(!!actor && currentUserCanReviewCopyrightNotices(actor))
      await transaction.commit()
      assert(replay.liveSnapshot, 404, territorialLabels(jurisdiction).noticeNotFound)
      const acknowledgment = decodeRetainedAcknowledgment(replay.liveSnapshot)
      assert(acknowledgment.acknowledged_at, 409, 'Acknowledgment is already terminal')
      return acknowledgment
    }
  }
  assert(owners[0], 404, territorialLabels(jurisdiction).noticeNotFound)
  const { rows } = await transaction<TerritorialAcknowledgmentRow>(
    lockTerritorialAcknowledgmentQuery(jurisdiction, noticeId),
  )
  const current = rows[0]
  assert(current, 404, territorialLabels(jurisdiction).noticeNotFound)
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
    await recordCopyrightReplayIdentity(
      replayAdmission?.forOriginalRequester(current.requester_user_id ?? '') ??
        (await CopyrightReplayAdmission.open(
          transaction,
          {
            ...replayInput,
            requester: current.requester_user_id ?? '',
          },
          noticeLifetime,
        )),
      noticeId,
      'acknowledgment_recorded',
      { ...publicAcknowledgment(updated) },
    )
  }
  await transaction.commit()
  return publicAcknowledgment(updated)
}
