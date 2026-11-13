import { beginTransaction } from '@data-stores/psql'
import { expect } from 'vitest'
import {
  recordEuCopyrightAcknowledgmentFailure,
  acknowledgeEuCopyrightNotice,
} from '../services/copyright-notices/eu-acknowledgment.mts'
import {
  lockTerritorialAcknowledgmentQuery,
  updateTerritorialAcknowledgmentQuery,
} from '../services/copyright-notices/territorial-acknowledgment-sql.mts'
import {
  advanceCopyrightLastLegalActivityAt,
  lockCopyrightNoticeForLegalWrite,
} from '../services/copyright-notices/last-legal-activity.mts'
import type { TerritorialCopyrightAcknowledgment } from '../services/copyright-notices/territorial-acknowledgment.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** A committed first failed delivery precedes the independent real acknowledgment actor. */
export async function seedWithdrawalFailedAcknowledgment(noticeId: string) {
  await using query = await beginTransaction()
  const notice = await lockCopyrightNoticeForLegalWrite(query, noticeId)
  const { rows } = await query<TerritorialCopyrightAcknowledgment>(
    lockTerritorialAcknowledgmentQuery('eu_dsa', noticeId),
  )
  if (!notice || !rows[0] || rows[0].attempt_count !== 0)
    throw new Error('Owned receipt must be pending its first attempt')
  const { rows: updated } = await query<TerritorialCopyrightAcknowledgment>(
    updateTerritorialAcknowledgmentQuery(rows[0].id, 'failed'),
  )
  await advanceCopyrightLastLegalActivityAt(query, notice)
  await query.commit()
  return updated[0]
}

/** Both actual receipt writers execute once and couple their DTO to the whole legal case/receipt state. */
export async function assertWithdrawalAcknowledgment(
  actor: PrivateUser,
  noticeId: string,
  failed: boolean,
) {
  const before = await readCopyrightApiTerritorialState(noticeId)
  const acknowledgment = before.acknowledgments[0]
  if (!acknowledgment || typeof acknowledgment.attempt_count !== 'number')
    throw new Error('Owned pending receipt missing')
  const [result] = await Promise.allSettled([
    failed
      ? recordEuCopyrightAcknowledgmentFailure(actor, noticeId)
      : acknowledgeEuCopyrightNotice(actor, noticeId),
  ])
  const after = await readCopyrightApiTerritorialState(noticeId)
  const at = after.acknowledgments[0]?.last_attempt_at
  const row = {
    ...acknowledgment,
    attempt_count: acknowledgment.attempt_count + 1,
    last_attempt_at: expect.any(Date),
    acknowledged_at: failed ? null : at,
    updated_at: expect.any(Date),
  }
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflicting copyright case change',
        causeCode: '40001',
      },
      state: before,
    },
    {
      outcome: {
        status: 'fulfilled',
        value: {
          id: acknowledgment.id,
          attempt_count: acknowledgment.attempt_count + 1,
          last_attempt_at: at,
          acknowledged_at: failed ? null : at,
          exhausted_at: null,
          escalated: false,
        },
      },
      state: {
        ...before,
        clock: { ...before.clock, at: expect.any(Date) },
        acknowledgments: [row],
      },
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
}
