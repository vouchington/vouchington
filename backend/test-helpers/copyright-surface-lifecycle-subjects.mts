import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  terminalDeliveryState,
} from './copyright-action-delivery-contract-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import type {
  SurfaceLifecycleFixture,
  SurfaceLifecycleCase,
} from './copyright-surface-lifecycle-fixtures.mts'

function owner(fixture: SurfaceLifecycleFixture, record: SurfaceLifecycleCase) {
  return {
    noticeId: record.noticeId,
    restrictionId: record.restrictionId,
    placementId: fixture.placementId,
    accountId: fixture.actorUserId,
  }
}

/** A real surface withhold keeps its complete legal/lease/tuple registry state at each commit boundary. */
export async function assertSurfaceLifecycleWithhold(
  fixture: SurfaceLifecycleFixture,
  record: SurfaceLifecycleCase,
  now = new Date(),
) {
  const input = owner(fixture, record)
  const before = await readDeliveryContractState(input)
  const claimed = claimedDeliveryState(before, record.withholdIntentId)
  const published = {
    ...claimed,
    physical: { withheld: true, revision: before.physical.revision + 1 },
    registry: [
      ...before.registry.map(row =>
        row.revision === before.physical.revision
          ? { ...row, desired: 'withheld', state: 'completed' }
          : row,
      ),
      { revision: before.physical.revision + 1, desired: 'withheld', state: 'completed' },
    ],
  }
  const terminal = terminalDeliveryState(published, record.withholdIntentId, 'completed')
  const completed = {
    ...terminal,
    state: {
      ...terminal.state,
      events: [...terminal.state.events, 'placement_withheld'].toSorted(),
    },
  }
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(record.withholdIntentId, now),
  ])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    { outcome: nativeCopyrightSerializationConflict, state: published },
    { outcome: { status: 'fulfilled', value: 'applied' }, state: completed },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(input),
  })
}

/** The independent committed reverse decision exists even if this actual worker stops after its claim. */
export async function assertSurfaceLifecycleRestore(
  fixture: SurfaceLifecycleFixture,
  record: SurfaceLifecycleCase,
  intentId: string,
  now = new Date(),
) {
  const input = owner(fixture, record)
  const before = await readDeliveryContractState(input)
  // Topic assets have no personal notifier under the immutable placement-party policy.
  const recipients = fixture.ownerKind === 'topic' ? [] : [fixture.actorUserId]
  expect(
    before.state.deliveries.filter(row => row.startsWith('poster_restriction_notice:')),
  ).toEqual(
    recipients
      .flatMap(id => [
        `poster_restriction_notice:email:${id}`,
        `poster_restriction_notice:in_app:${id}`,
      ])
      .toSorted(),
  )
  const claimed = claimedDeliveryState(before, intentId)
  const prepared = {
    ...claimed,
    physical: { withheld: false, revision: before.physical.revision + 1 },
    state: {
      ...claimed.state,
      restrictions: claimed.state.restrictions.map(row =>
        row.id === record.restrictionId ? { ...row, lifted: now } : row,
      ),
      events: [...claimed.state.events, 'restoration_authorized_pending_delivery'].toSorted(),
      correspondence: [
        ...claimed.state.correspondence,
        ...recipients.map(() => 'restoration_notice' as const),
      ].toSorted(),
      deliveries: [
        ...claimed.state.deliveries,
        ...recipients.flatMap(id => [
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
  const terminal = terminalDeliveryState(published, intentId, 'completed')
  const completed = {
    ...terminal,
    state: {
      ...terminal.state,
      events: [...terminal.state.events, 'placement_restored'].toSorted(),
    },
  }
  const [result] = await Promise.allSettled([processCopyrightActionIntent(intentId, now)])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    { outcome: nativeCopyrightSerializationConflict, state: prepared },
    { outcome: { status: 'fulfilled', value: 'applied' }, state: completed },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(input),
  })
}
