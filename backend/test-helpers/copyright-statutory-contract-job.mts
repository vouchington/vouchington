import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  preparedDeliveryState,
  terminalDeliveryState,
  statutoryDeliveryCompleted,
} from './copyright-action-delivery-contract-state.mts'
import { actionDeliveryOwner } from './copyright-action-delivery-authority-subject.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import type { ActionDeliveryScene } from './copyright-action-delivery-contract-fixtures.mts'

/** A statutory job may stop at its committed claim or fail-closed preparation, never half a legal stage. */
export async function assertStatutoryContractJob(scene: ActionDeliveryScene, blocked = false) {
  const owner = actionDeliveryOwner(scene)
  const before = await readDeliveryContractState(owner)
  const claimed = {
    ...claimedDeliveryState(before, scene.restore.id),
    failures: before.failures.map(row =>
      row.id === scene.restore.id ? { ...row, message: null } : row,
    ),
  }
  const prepared = preparedDeliveryState(claimed, {
    intentId: scene.restore.id,
    restrictionId: scene.restriction.id,
    now: scene.restorationAt,
  })
  const denied = {
    ...prepared,
    registry: prepared.registry.map(row =>
      row.revision === prepared.physical.revision
        ? { ...row, desired: 'withheld', state: 'completed' }
        : row,
    ),
  }
  const published = {
    ...prepared,
    registry: prepared.registry.map(row =>
      row.revision === prepared.physical.revision
        ? { ...row, desired: 'allow', state: 'completed' }
        : row,
    ),
    state: {
      ...prepared.state,
      events: [...prepared.state.events, 'placement_restored'].toSorted(),
    },
  }
  const completed = statutoryDeliveryCompleted(
    terminalDeliveryState(published, scene.restore.id, 'completed'),
    scene.notice.id,
  )
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
  ])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    ...(blocked
      ? [{ outcome: { status: 'fulfilled', value: 'not_claimed' }, state: before }]
      : [
          { outcome: nativeCopyrightSerializationConflict, state: claimed },
          { outcome: nativeCopyrightSerializationConflict, state: denied },
          { outcome: { status: 'fulfilled', value: 'applied' }, state: completed },
        ]),
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(owner),
  })
}
