import { restorationDeliveryStages } from './copyright-restoration-delivery-stages.mts'
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

function owner(
  fixture: Pick<SurfaceLifecycleFixture, 'placementId' | 'actorUserId'>,
  record: Pick<SurfaceLifecycleCase, 'noticeId' | 'restrictionId'>,
) {
  return {
    noticeId: record.noticeId,
    restrictionId: record.restrictionId,
    placementId: fixture.placementId,
    accountId: fixture.actorUserId,
  }
}

/** A real surface withhold keeps its complete legal/lease/tuple registry state at each commit boundary. */
export async function assertSurfaceLifecycleWithhold(
  fixture: Pick<SurfaceLifecycleFixture, 'placementId' | 'actorUserId'>,
  record: Pick<SurfaceLifecycleCase, 'noticeId' | 'restrictionId' | 'withholdIntentId'>,
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
      ...(before.registry.some(row => row.revision === before.physical.revision)
        ? []
        : [{ revision: before.physical.revision, desired: 'withheld', state: 'completed' }]),
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
  fixture: Pick<SurfaceLifecycleFixture, 'placementId' | 'actorUserId' | 'ownerKind'>,
  record: Pick<SurfaceLifecycleCase, 'noticeId' | 'restrictionId'>,
  intentId: string,
  now = new Date(),
) {
  const input = owner(fixture, record)
  const before = await readDeliveryContractState(input)
  // Topic assets have no personal notifier under the immutable placement-party policy.
  const recipients = fixture.ownerKind === 'topic' ? [] : [fixture.actorUserId]
  const { claimed, prepared, completed } = restorationDeliveryStages(before, {
    restrictionId: record.restrictionId,
    intentId,
    now,
    recipients,
  })
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
