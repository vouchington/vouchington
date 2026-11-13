import { expect } from 'vitest'
import { finalizeCopyrightActionAfterDelivery } from '../services/copyright-notices/action-delivery-finalization.mts'
import {
  readDeliveryContractState,
  terminalDeliveryState,
} from './copyright-action-delivery-contract-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { actionDeliveryOwner } from './copyright-action-delivery-authority-subject.mts'
import type {
  ActionDeliveryScene,
  prepareActionDeliveryRestore,
} from './copyright-action-delivery-contract-fixtures.mts'

/** Finalization cannot complete an allow after its tuple or court authority ceased to qualify. */
export async function assertPreparedActionFinalization(
  scene: ActionDeliveryScene,
  prepared: Awaited<ReturnType<typeof prepareActionDeliveryRestore>>,
  kind: 'withhold' | 'court',
) {
  const owner = actionDeliveryOwner(scene)
  const before = await readDeliveryContractState(owner)
  const [result] = await Promise.allSettled([
    finalizeCopyrightActionAfterDelivery(
      scene.restore.id,
      prepared.legal.lease_token,
      'restore',
      scene.restorationAt,
    ),
  ])
  const terminal = terminalDeliveryState(
    before,
    scene.restore.id,
    kind === 'court' ? 'blocked' : 'stale',
    kind === 'court'
      ? 'A current copyright blocker was admitted before restore delivery completed.'
      : 'Placement changed while its exact delivery tuple was being projected.',
  )
  expect([
    { outcome: { status: 'fulfilled', value: false }, state: terminal },
    { outcome: nativeCopyrightSerializationConflict, state: before },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(owner),
  })
}
