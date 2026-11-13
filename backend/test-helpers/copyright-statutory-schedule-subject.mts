import { expect } from 'vitest'
import {
  createDueStatutoryCopyrightRestoreIntentsForDeadline,
  searchDueStatutoryCopyrightRestorationDeadlineIds,
} from '../services/copyright-notices/statutory-restoration-schedule.mts'
import {
  readDeliveryContractState,
  type DeliveryContractOwner,
} from './copyright-action-delivery-contract-state.mts'
import { readTestOwnedCopyrightSweepIds } from './services/copyright-notices/sweep-ids.mts'
import { encodeUuidCursorBefore } from './modules/pagination/uuid-cursors.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

/** The dispatcher commits the scoped restore obligation, audit and misuse together or leaves it due. */
export async function assertStatutoryScheduleMaterialization(
  owner: DeliveryContractOwner & { deadlineId: string },
  now: Date,
  blocked = false,
) {
  const before = await readDeliveryContractState(owner)
  const page = await searchDueStatutoryCopyrightRestorationDeadlineIds({
    now,
    after: encodeUuidCursorBefore(owner.deadlineId),
    limit: 1,
  })
  expect(page.results).toEqual([owner.deadlineId])
  expect(Object.keys(page.candidates)).toEqual([owner.deadlineId])
  const [result] = await Promise.allSettled([
    createDueStatutoryCopyrightRestoreIntentsForDeadline(page.candidates[owner.deadlineId]!, now),
  ])
  const after = await readDeliveryContractState(owner)
  const restoreId = after.state.actions.find(row => row.action === 'restore')?.id
  const success = {
    ...before,
    attempts: [...before.attempts, { id: restoreId, count: 0, lease: false, reason: null }],
    failures: [...before.failures, { id: restoreId, message: null }],
    misuse: [
      ...before.misuse,
      { restriction: owner.restrictionId, outcome: 'restriction_reversed_by_counter_notice' },
    ],
    state: {
      ...before.state,
      actions: [
        ...before.state.actions,
        {
          id: restoreId,
          restriction: owner.restrictionId,
          deadline: owner.deadlineId,
          revision: before.physical.revision,
          action: 'restore',
          state: 'pending',
        },
      ],
      events: [...before.state.events, 'restoration_intent_created'].toSorted(),
    },
  }
  const outcome =
    result!.status === 'fulfilled'
      ? result
      : result!.reason instanceof AggregateError
        ? {
            status: 'aggregate',
            message: result!.reason.message,
            errors: result!.reason.errors.map((reason: unknown) =>
              copyrightRaceResult({ status: 'rejected', reason }),
            ),
          }
        : copyrightRaceResult(result!)
  const due = await readTestOwnedCopyrightSweepIds(
    options => searchDueStatutoryCopyrightRestorationDeadlineIds({ ...options, now }),
    owner.deadlineId,
  )
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before, due: [owner.deadlineId] },
    ...(blocked
      ? [
          {
            outcome: {
              status: 'aggregate',
              message: 'Failed to materialize one or more due copyright restoration intents',
              errors: [
                {
                  status: 'rejected',
                  statusCode: 409,
                  code: undefined,
                  message: 'Copyright restoration is not eligible',
                  causeCode: undefined,
                },
              ],
            },
            state: before,
            due: [owner.deadlineId],
          },
        ]
      : [{ outcome: { status: 'fulfilled', value: 1 }, state: success, due: [] }]),
  ]).toContainEqual({ outcome, state: after, due })
}
