import { afterEach, describe, expect, it, vi } from 'vitest'
import { rejectTestMediaDeliveryEdgeState } from '@voucha/test-helpers/copyright-delivery-edge'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { publishStagedMediaDeliveryRecord } from '@services/media-delivery-safety'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { completeTestClaimedCopyrightAction } from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import {
  seedStatutoryContractHold,
  seedStatutoryContractHoldResolution,
  seedCompletedStatutoryContract,
} from '@voucha/test-helpers/copyright-statutory-contract-fixtures'
import {
  seedOrdinaryClaimedRestore,
  seedOrdinaryInterruptedRestore,
  seedOrdinaryUnassessedFiling,
  seedOrdinaryCounterSuperseded,
  seedOrdinaryNonqualifyingFiling,
} from '@voucha/test-helpers/copyright-ordinary-restoration-fixtures'
import {
  assertOrdinaryRestorationJob,
  assertOrdinaryPublicationOutage,
} from '@voucha/test-helpers/copyright-ordinary-restoration-subjects'
import {
  prepareActionDeliveryRestore,
  actionDeliveryCurrentTuple,
} from '@voucha/test-helpers/copyright-action-delivery-contract-fixtures'
import { readDeliveryContractState } from '@voucha/test-helpers/copyright-action-delivery-contract-state'
import { actionDeliveryOwner } from '@voucha/test-helpers/copyright-action-delivery-authority-subject'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import { seedRestorationSceneWithhold } from '@voucha/test-helpers/copyright-withhold-scene-fixture'

describe('ordinary copyright hold restoration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('blocks a restore a worker already claimed, so its completion matches no row', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const token = await seedOrdinaryClaimedRestore(scene)
    await seedStatutoryContractHold(scene)
    const before = await readDeliveryContractState(actionDeliveryOwner(scene))
    expect(before.state.actions.find(row => row.id === scene.restore.id)!.state).toBe('blocked')
    await expect(
      completeTestClaimedCopyrightAction({
        intentId: scene.restore.id,
        leaseToken: token,
        completedAt: scene.restorationAt,
      }),
    ).rejects.toThrow('lease expired')
    expect(await readDeliveryContractState(actionDeliveryOwner(scene))).toEqual(before)
    await assertOrdinaryRestorationJob(scene, 'notClaimed')
  })

  it('reopens the original statutory restore only after both ordinary holds resolve', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const first = await seedStatutoryContractHold(scene)
    const second = await seedStatutoryContractHold(scene)
    await seedStatutoryContractHoldResolution(scene, first.id)
    const partial = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(partial!.actionIntents.find(row => row.id === scene.restore.id)!.state).toBe('blocked')
    await expect(getImagePlacementForCopyright(scene.target.placement_id)).resolves.toMatchObject({
      withheld: true,
    })
    await seedStatutoryContractHoldResolution(scene, second.id)
    const resolved = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(resolved!.actionIntents.filter(row => row.action === 'restore')).toEqual([
      expect.objectContaining({
        id: scene.restore.id,
        copyright_restriction_id: scene.restore.copyright_restriction_id,
        copyright_notice_deadline_id: scene.restore.copyright_notice_deadline_id,
        expected_placement_revision: scene.restore.expected_placement_revision,
        state: 'pending',
      }),
    ])
    expect(resolved!.restrictions).toHaveLength(1)
    expect(resolved!.deadlines).toHaveLength(1)
    expect(
      resolved!.lifecycleEvents.filter(row => row.change_type === 'copyright_action_replayed'),
    ).toHaveLength(1)
    await assertOrdinaryRestorationJob(scene)
  })

  it('makes an independently committed final-hold release physically restorable', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const first = await seedStatutoryContractHold(scene)
    const second = await seedStatutoryContractHold(scene)
    await seedStatutoryContractHoldResolution(scene, first.id)
    await seedStatutoryContractHoldResolution(scene, second.id)
    await seedCompletedStatutoryContract(scene)
    await expect(getImagePlacementForCopyright(scene.target.placement_id)).resolves.toMatchObject({
      withheld: false,
    })
  })

  it('restores only the counter-noticed target in a two-target case', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore(2)
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const other = aggregate!.targets.find(row => row.id !== scene.target.id)!
    const withhold = aggregate!.actionIntents.find(
      row => row.action === 'withhold' && row.id !== scene.initialWithhold.id,
    )!
    await prepublishCopyrightImagePlacementDenial(
      await actionDeliveryCurrentTuple(other.placement_id),
    )
    await seedRestorationSceneWithhold(withhold.id)
    const hold = await seedStatutoryContractHold(scene, [scene.target.id, other.id])
    await seedStatutoryContractHoldResolution(scene, hold.id)
    await assertOrdinaryRestorationJob(scene)
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after!.actionIntents.flatMap(row => (row.action === 'restore' ? [row.id] : []))).toEqual(
      [scene.restore.id],
    )
    expect(
      after!.restrictions.find(row => row.copyright_notice_target_id === other.id)!.lifted_at,
    ).toBeNull()
    expect(after!.deadlines).toHaveLength(1)
    await expect(getImagePlacementForCopyright(other.placement_id)).resolves.toMatchObject({
      withheld: true,
    })
  })

  it('retains full prepared/released fail-closed stages when the external allow publication fails', async () => {
    expect.hasAssertions()
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const failure = new Error('External publication unavailable.')
    rejectTestMediaDeliveryEdgeState(edge, 'allow', failure)
    await assertOrdinaryPublicationOutage(scene, failure)
  })

  it('always reaches the actual failed provider boundary from an independently committed preparation', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const prepared = await prepareActionDeliveryRestore(scene)
    const before = await readDeliveryContractState(actionDeliveryOwner(scene))
    const failure = new Error('External publication unavailable.')
    rejectTestMediaDeliveryEdgeState(edge, 'allow', failure)
    await expect(
      publishStagedMediaDeliveryRecord(prepared.mediaDeliveryRegistryRecordId),
    ).rejects.toBe(failure)
    expect(await readDeliveryContractState(actionDeliveryOwner(scene))).toEqual(before)
    const key = getImagePlacementDeliveryKey(prepared)
    expect(edge.put).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryKey: key, state: 'allow' }),
    )
    expect(edge.records.get(key)).toBeUndefined()
  })

  it('blocks an already applied interrupted restore when an unassessed filing arrives', async () => {
    expect.hasAssertions()
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    await seedOrdinaryInterruptedRestore(scene)
    await seedOrdinaryUnassessedFiling(scene)
    await assertOrdinaryRestorationJob(
      scene,
      'blockedPending',
      new Date(scene.restorationAt.getTime() + 120_000),
    )
  })

  it.each(['current', 'superseded'] as const)(
    'rechecks %s original authority after a committed interrupted restore and filing',
    async authority => {
      installTestMediaDeliveryEdge()
      const scene = await openHeldCounterNoticeRestore()
      await seedOrdinaryInterruptedRestore(scene)
      const applied = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(applied!.restrictions[0]!.lifted_at).not.toBeNull()
      expect(applied!.deadlines[0]!.resolved_at).not.toBeNull()
      const filing = await seedOrdinaryUnassessedFiling(scene, true)
      const at = new Date(scene.restorationAt.getTime() + 120_000)
      if (authority === 'superseded') await seedOrdinaryCounterSuperseded(scene, at)
      await seedOrdinaryNonqualifyingFiling(scene, filing.id, at)
      const reopened = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(reopened!.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
        state: authority === 'current' ? 'pending' : 'blocked',
        expected_placement_revision: scene.restore.expected_placement_revision,
        copyright_notice_deadline_id: scene.restore.copyright_notice_deadline_id,
      })
      expect(reopened!.deadlines).toEqual(applied!.deadlines)
      await assertOrdinaryRestorationJob(
        scene,
        authority === 'current' ? 'reentry' : 'notClaimed',
        at,
      )
    },
  )
})
