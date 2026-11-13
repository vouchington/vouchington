import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import { getImagePlacementForCopyright } from '../services/images/placements.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  readCopyrightAssessmentRaceState,
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

/** Edge failure and SSI both leave the authorized statements durable and the placement unchanged. */
export async function assertStatementWithholdFailure(
  noticeId: string,
  actionId: string,
  placementId: string,
) {
  const before = await state(noticeId, actionId, placementId)
  const [result] = await Promise.allSettled([processCopyrightActionIntent(actionId, new Date())])
  const after = await state(noticeId, actionId, placementId)
  const claimed = {
    ...before,
    work: { count: 1, leased: true, reason: null, failure: null },
    legal: {
      ...before.legal,
      actions: before.legal.actions.map(row =>
        row.id === actionId ? { ...row, state: 'claimed' } : row,
      ),
    },
  }
  const retrying = {
    ...before,
    work: { count: 1, leased: false, reason: null, failure: 'Edge unavailable' },
  }
  const edgeFailure = { status: 'rejected', message: 'Edge unavailable' }
  const outcome =
    result!.status === 'rejected' && (result!.reason as { code?: string }).code !== '40001'
      ? { status: 'rejected', message: (result!.reason as Error).message }
      : copyrightRaceResult(result!)
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    { outcome: edgeFailure, state: claimed },
    { outcome: edgeFailure, state: retrying },
  ]).toContainEqual({ outcome, state: after })
}

async function state(noticeId: string, actionId: string, placementId: string) {
  const [legal, aggregate, placement] = await Promise.all([
    readCopyrightAssessmentRaceState(noticeId),
    getCopyrightNoticePrivateAggregate(noticeId),
    getImagePlacementForCopyright(placementId),
  ])
  const work = aggregate?.actionIntents.find(row => row.id === actionId)
  if (!work || !placement) throw new Error('Owned failed-delivery scene disappeared')
  return {
    legal,
    physical: { withheld: placement.withheld, revision: placement.revision },
    work: {
      count: work.attempt_count,
      leased: work.leased_at !== null,
      reason: work.completed_at_reason,
      failure: work.failure_message,
    },
  }
}
