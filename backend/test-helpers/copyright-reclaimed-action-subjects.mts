import { expect } from 'vitest'
import {
  claimCopyrightActionIntent,
  failCopyrightActionIntent,
} from '../services/copyright-notices/action-delivery-state.mts'
import { executeCopyrightActionIntent } from '../services/copyright-notices/action-delivery-execution.mts'
import { compensateCopyrightActionFailure } from '../services/copyright-notices/action-delivery-compensation.mts'
import { getCopyrightActionDeliveryDependencies } from '../services/copyright-notices/action-delivery-dependencies.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  terminalDeliveryState,
} from './copyright-action-delivery-contract-state.mts'
import { completeTestCopyrightActionClaim } from './copyright-lease-fencing.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import {
  readReclaimedActionAuthority,
  type createReclaimedActionFixture,
} from './copyright-reclaimed-action-fixtures.mts'

type Scene = Awaited<ReturnType<typeof createReclaimedActionFixture>>

/** Actual reclaim either changes the entire owned lease or leaves the expired owner unchanged. */
export async function assertActionReclaim(scene: Scene) {
  const before = await readDeliveryContractState(scene)
  const authority = await readReclaimedActionAuthority(scene.intentId)
  const [result] = await Promise.allSettled([claimCopyrightActionIntent(scene.intentId, scene.now)])
  const value = result!.status === 'fulfilled' ? result!.value : null
  expect([
    {
      outcome: { status: 'fulfilled', value: { ...scene.old, lease_token: expect.any(String) } },
      state: claimedDeliveryState(before, scene.intentId),
      authority: { token: value?.lease_token, attempts: 2, state: 'claimed' },
    },
    { outcome: nativeCopyrightSerializationConflict, state: before, authority },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(scene),
    authority: await readReclaimedActionAuthority(scene.intentId),
  })
  if (value) expect(value.lease_token).not.toBe(scene.old.lease_token)
}

/** Stale owner guards run independently of reclaim's possible SSI outcome and write no side effects. */
export async function assertReclaimedActionGuards(scene: Scene) {
  expect(scene.current.lease_token).not.toBe(scene.old.lease_token)
  const before = await readDeliveryContractState(scene)
  const authority = await readReclaimedActionAuthority(scene.intentId)
  await expect(
    completeTestCopyrightActionClaim(scene.intentId, scene.old.lease_token, scene.now),
  ).rejects.toThrow('lease expired')
  expect(await readDeliveryContractState(scene)).toEqual(before)
  const operations = [
    {
      action: () =>
        failCopyrightActionIntent({
          intentId: scene.intentId,
          leaseToken: scene.old.lease_token,
          failedAt: scene.now,
          failureMessage: 'late',
        }),
      expected: { status: 'fulfilled', value: 'not_claimed' },
    },
    {
      action: () =>
        executeCopyrightActionIntent(
          scene.old,
          scene.now,
          getCopyrightActionDeliveryDependencies({}),
        ),
      expected: { status: 'fulfilled', value: 'not_claimed' },
    },
  ]
  await Promise.all(
    operations.map(async operation => {
      const [result] = await Promise.allSettled([operation.action()])
      expect([
        { outcome: operation.expected, state: before, authority },
        { outcome: nativeCopyrightSerializationConflict, state: before, authority },
      ]).toContainEqual({
        outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
        state: await readDeliveryContractState(scene),
        authority: await readReclaimedActionAuthority(scene.intentId),
      })
    }),
  )
  const failure = new Error('expired worker failed')
  const [compensation] = await Promise.allSettled([
    compensateCopyrightActionFailure(
      scene.old,
      scene.now,
      {
        placementId: scene.old.placement_id,
        revision: scene.old.expected_placement_revision,
        imageId: scene.old.image_id,
      },
      failure,
    ),
  ])
  expect([
    { reason: failure, state: before, authority },
    { outcome: nativeCopyrightSerializationConflict, state: before, authority },
  ]).toContainEqual({
    ...(compensation!.status === 'rejected' && compensation!.reason === failure
      ? { reason: compensation!.reason }
      : { outcome: copyrightRaceResult(compensation!) }),
    state: await readDeliveryContractState(scene),
    authority: await readReclaimedActionAuthority(scene.intentId),
  })
  await completeTestCopyrightActionClaim(scene.intentId, scene.current.lease_token, scene.now)
  expect(await readDeliveryContractState(scene)).toEqual(
    terminalDeliveryState(before, scene.intentId, 'completed'),
  )
  expect(await readReclaimedActionAuthority(scene.intentId)).toEqual({
    ...authority,
    token: null,
    state: 'completed',
  })
}
