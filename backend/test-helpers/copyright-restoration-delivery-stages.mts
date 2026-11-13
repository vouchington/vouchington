import { expect } from 'vitest'
import {
  claimedDeliveryState,
  terminalDeliveryState,
  type DeliveryContractState,
} from './copyright-action-delivery-contract-state.mts'

/** Every allowed restore phase carries its exact recipient obligations, physical tuple and terminal audit. */
export function restorationDeliveryStages(
  before: DeliveryContractState,
  input: { restrictionId: string; intentId: string; now: Date; recipients: readonly string[] },
) {
  expect(
    before.state.deliveries.filter(row => row.startsWith('poster_restriction_notice:')),
  ).toEqual(
    input.recipients
      .flatMap(id => [
        `poster_restriction_notice:email:${id}`,
        `poster_restriction_notice:in_app:${id}`,
      ])
      .toSorted(),
  )
  const claimed = claimedDeliveryState(before, input.intentId)
  const prepared = {
    ...claimed,
    physical: { withheld: false, revision: before.physical.revision + 1 },
    state: {
      ...claimed.state,
      restrictions: claimed.state.restrictions.map(row =>
        row.id === input.restrictionId ? { ...row, lifted: input.now } : row,
      ),
      events: [...claimed.state.events, 'restoration_authorized_pending_delivery'].toSorted(),
      correspondence: [
        ...claimed.state.correspondence,
        ...input.recipients.map(() => 'restoration_notice' as const),
      ].toSorted(),
      deliveries: [
        ...claimed.state.deliveries,
        ...input.recipients.flatMap(id => [
          `poster_restoration_notice:email:${id}`,
          `poster_restoration_notice:in_app:${id}`,
        ]),
      ].toSorted(),
    },
    registry: [
      ...claimed.registry,
      { revision: before.physical.revision + 1, desired: 'withheld', state: 'completed' },
    ],
  }
  const published = {
    ...prepared,
    registry: prepared.registry.map(row =>
      row.revision === prepared.physical.revision
        ? { ...row, desired: 'allow', state: 'completed' }
        : row,
    ),
  }
  const terminal = terminalDeliveryState(published, input.intentId, 'completed')
  const completed = {
    ...terminal,
    state: {
      ...terminal.state,
      events: [...terminal.state.events, 'placement_restored'].toSorted(),
    },
  }
  return { claimed, prepared, completed }
}
