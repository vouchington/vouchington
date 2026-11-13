import { expect } from 'vitest'
import { liftCopyrightRestrictionWithoutSetter } from '../services/copyright-notices/restriction-lifts.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { readCommittedReversalState } from './copyright-reversal-state.mts'

/** An administrator decision commits its history, notices and restore obligation together. */
export async function assertSurfaceLiftOutcome(
  input: Parameters<typeof liftCopyrightRestrictionWithoutSetter>[0],
  placementId: string,
  claimantDeliveries: string[] = [],
) {
  const before = await readCommittedReversalState(input.noticeId, input.restrictionId, placementId)
  const [result] = await Promise.allSettled([liftCopyrightRestrictionWithoutSetter(input)])
  const after = await readCommittedReversalState(input.noticeId, input.restrictionId, placementId)
  const liftId = after.lifts.find(row => row.restriction === input.restrictionId)?.id
  const restore = after.state.actions.find(row => row.action === 'restore')
  expect([
    {
      outcome: { status: 'fulfilled', id: liftId },
      state: {
        ...before,
        lifts: [{ id: liftId, restriction: input.restrictionId, actor: input.currentUser.id }],
        flags: {
          reversal_authorized: true,
          reversal_by_review: false,
          reversal_by_appeal: false,
          reversal_by_administrator_lift: true,
        },
        state: {
          ...before.state,
          actions: [
            ...before.state.actions,
            {
              id: restore?.id,
              restriction: input.restrictionId,
              deadline: null,
              revision: before.physical.revision,
              action: 'restore',
              state: 'pending',
            },
          ],
          events: [
            ...before.state.events,
            'restriction_lifted_by_administrator',
            'reversal_restoration_intent_created',
          ].toSorted(),
          deliveries: [...before.state.deliveries, ...claimantDeliveries].toSorted(),
          correspondence: [...before.state.correspondence, 'decision_notice'].toSorted(),
          staydown: 0,
        },
        attempts: [...before.attempts, { id: restore?.id, count: 0, lease: false, reason: null }],
      },
    },
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
  ]).toContainEqual({ outcome: copyrightRaceResult(result!), state: after })
}

/** Role and live-responder guards leave the complete owned case unchanged. */
export async function assertSurfaceLiftGuard(
  input: Parameters<typeof liftCopyrightRestrictionWithoutSetter>[0],
  placementId: string,
  statusCode: 403 | 409,
  message: string,
) {
  const before = await readCommittedReversalState(input.noticeId, input.restrictionId, placementId)
  const [result] = await Promise.allSettled([liftCopyrightRestrictionWithoutSetter(input)])
  const allowed = [
    {
      outcome: { status: 'rejected', statusCode, code: undefined, message, causeCode: undefined },
      state: before,
    },
  ]
  expect([
    ...allowed,
    ...(statusCode === 409
      ? [
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
        ]
      : []),
  ]).toContainEqual({
    outcome: copyrightRaceResult(result!),
    state: await readCommittedReversalState(input.noticeId, input.restrictionId, placementId),
  })
}
