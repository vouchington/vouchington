import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import { withholdImagePlacementForCopyright } from '../services/images/placements.mts'
import { compensateCopyrightActionFailure } from '../services/copyright-notices/action-delivery-compensation.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { actionDeliveryOwner } from './copyright-action-delivery-authority-subject.mts'
import {
  actionDeliveryCurrentTuple,
  type ActionDeliveryScene,
  type prepareActionDeliveryRestore,
} from './copyright-action-delivery-contract-fixtures.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  preparedDeliveryState,
  terminalDeliveryState,
  type DeliveryContractState,
} from './copyright-action-delivery-contract-state.mts'

const outage = {
  status: 'rejected',
  statusCode: undefined,
  code: undefined,
  message: 'rollback outage',
  causeCode: undefined,
}

/** The real worker cannot claim to restore visibility after its fail-closed rollback publication fails. */
export async function assertActionDeliveryOutageJob(scene: ActionDeliveryScene) {
  const owner = actionDeliveryOwner(scene)
  const before = await readDeliveryContractState(owner)
  const claimed = claimedDeliveryState(before, scene.restore.id)
  const prepared = preparedDeliveryState(claimed, {
    intentId: scene.restore.id,
    restrictionId: scene.restriction.id,
    now: scene.restorationAt,
  })
  let changed: DeliveryContractState | undefined
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
      publishStagedMediaDeliveryRecord: async () => {
        expect(await readDeliveryContractState(owner)).toEqual(prepared)
        const tuple = await actionDeliveryCurrentTuple(scene.target.placement_id)
        await expect(
          withholdImagePlacementForCopyright({
            placementId: tuple.placementId,
            expectedRevision: tuple.revision,
          }),
        ).resolves.toMatchObject({ status: 'applied' })
        changed = {
          ...prepared,
          physical: { withheld: true, revision: prepared.physical.revision + 1 },
        }
      },
    }),
  ])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    ...(changed
      ? [
          { outcome: outage, state: changed },
          {
            outcome: outage,
            state: terminalDeliveryState(
              changed,
              scene.restore.id,
              'stale',
              'Placement changed while its exact delivery tuple was being projected.',
            ),
          },
        ]
      : []),
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(owner),
  })
}

/** An independently committed preparation always reaches the real compensation/provider boundary. */
export async function assertPreparedActionCompensation(
  scene: ActionDeliveryScene,
  prepared: Awaited<ReturnType<typeof prepareActionDeliveryRestore>>,
) {
  const owner = actionDeliveryOwner(scene)
  const before = await readDeliveryContractState(owner)
  const [result] = await Promise.allSettled([
    compensateCopyrightActionFailure(
      {
        id: scene.restore.id,
        action: 'restore',
        expected_placement_revision: scene.restore.expected_placement_revision,
        lease_token: prepared.legal.lease_token,
        placement_id: prepared.placementId,
        image_id: prepared.imageId,
      },
      scene.restorationAt,
      prepared,
      new Error('rollback outage'),
    ),
  ])
  expect([
    { outcome: outage, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: before },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(owner),
  })
}
