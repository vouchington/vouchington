import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import { readCommittedReversalState } from './copyright-reversal-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

/** A real restore may stop at any committed phase; each remaining invocation ends without retry. */
export async function assertReversalDeliveryOutcome(input: {
  noticeId: string
  restrictionId: string
  placementId: string
  restoreId: string
  posterId: string
}) {
  const before = await readCommittedReversalState(
    input.noticeId,
    input.restrictionId,
    input.placementId,
  )
  const [result] = await Promise.allSettled([processCopyrightActionIntent(input.restoreId)])
  const after = await readCommittedReversalState(
    input.noticeId,
    input.restrictionId,
    input.placementId,
  )
  const claimed = {
    ...before,
    state: {
      ...before.state,
      actions: before.state.actions.map(row =>
        row.id === input.restoreId ? { ...row, state: 'claimed' } : row,
      ),
    },
    attempts: before.attempts.map(row =>
      row.id === input.restoreId ? { ...row, count: 1, lease: true } : row,
    ),
  }
  const prepared = {
    ...claimed,
    state: {
      ...claimed.state,
      restrictions: claimed.state.restrictions.map(row =>
        row.id === input.restrictionId ? { ...row, lifted: expect.any(Date) } : row,
      ),
      events: [...claimed.state.events, 'restoration_authorized_pending_delivery'].toSorted(),
      deliveries: [
        ...claimed.state.deliveries,
        `poster_restoration_notice:email:${input.posterId}`,
        `poster_restoration_notice:in_app:${input.posterId}`,
      ].toSorted(),
      correspondence: [...claimed.state.correspondence, 'restoration_notice'].toSorted(),
    },
    physical: { withheld: false, revision: before.physical.revision + 1 },
    registry: [
      ...before.registry,
      { revision: before.physical.revision + 1, desired: 'withheld', state: 'completed' },
    ],
  }
  const completed = {
    ...prepared,
    state: {
      ...prepared.state,
      actions: prepared.state.actions.map(row =>
        row.id === input.restoreId ? { ...row, state: 'completed' } : row,
      ),
      events: [...prepared.state.events, 'placement_restored'].toSorted(),
    },
    attempts: prepared.attempts.map(row =>
      row.id === input.restoreId ? { ...row, reason: 'completed', lease: false } : row,
    ),
    registry: [
      ...before.registry,
      { revision: before.physical.revision + 1, desired: 'allow', state: 'completed' },
    ],
  }
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    { outcome: nativeCopyrightSerializationConflict, state: prepared },
    { outcome: { status: 'fulfilled', value: 'applied' }, state: completed },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
}
