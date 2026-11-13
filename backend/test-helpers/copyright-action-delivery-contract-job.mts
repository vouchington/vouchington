import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  preparedDeliveryState,
  terminalDeliveryState,
  statutoryDeliveryCompleted,
  type DeliveryContractOwner,
} from './copyright-action-delivery-contract-state.mts'

/** Complete job result is coupled to its exact commit phase, without retrying a native abort. */
export async function assertActionDeliveryTerminalJob(
  input: DeliveryContractOwner & {
    intentId: string
    now: Date
    outcome: 'stale' | 'unavailable' | 'replay'
    message?: string
  },
) {
  const before = await readDeliveryContractState(input)
  const claimed = claimedDeliveryState(before, input.intentId)
  const unavailable = preparedDeliveryState(claimed, { ...input, unavailable: true })
  const completed =
    input.outcome === 'unavailable'
      ? statutoryDeliveryCompleted(
          terminalDeliveryState(
            unavailable,
            input.intentId,
            'completed',
            'Restoration resolved without delivery because the placement is unavailable.',
          ),
          input.noticeId,
        )
      : terminalDeliveryState(claimed, input.intentId, 'stale', input.message!)
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(input.intentId, input.now),
  ])
  const success =
    input.outcome === 'replay'
      ? { outcome: { status: 'fulfilled', value: 'not_claimed' }, state: before }
      : {
          outcome: {
            status: 'fulfilled',
            value: input.outcome === 'unavailable' ? 'applied' : 'stale',
          },
          state: completed,
        }
  expect([
    success,
    { outcome: nativeCopyrightSerializationConflict, state: before },
    ...(input.outcome === 'replay'
      ? []
      : [{ outcome: nativeCopyrightSerializationConflict, state: claimed }]),
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(input),
  })
}

export async function assertDisabledActionDeliveryJob(
  input: DeliveryContractOwner & { intentId: string; now: Date; message: string },
) {
  const before = await readDeliveryContractState(input)
  const claimed = claimedDeliveryState(before, input.intentId)
  const message = input.message
  const released = {
    ...claimed,
    state: {
      ...claimed.state,
      actions: claimed.state.actions.map(row =>
        row.id === input.intentId ? { ...row, state: 'pending' } : row,
      ),
    },
    attempts: claimed.attempts.map(row =>
      row.id === input.intentId ? { ...row, lease: false } : row,
    ),
    failures: claimed.failures.map(row => (row.id === input.intentId ? { ...row, message } : row)),
  }
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(input.intentId, input.now),
  ])
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: undefined,
        code: undefined,
        message,
        causeCode: undefined,
      },
      state: released,
    },
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(input),
  })
}
