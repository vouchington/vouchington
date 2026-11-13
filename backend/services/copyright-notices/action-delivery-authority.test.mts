import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  publishStagedMediaDeliveryRecord,
  replayFailedMediaDeliveryRegistryRecords,
  stageImagePlacementDeliveryRecord,
  processMediaDeliveryRegistryRecord,
} from '@services/media-delivery-safety'
import { stageTestImagePlacementDeliveryRecordsForImageIds } from '@voucha/test-helpers/media-delivery-recovery'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getTestMediaDeliveryRecord, markTestMediaDeliveryRecordFailed } from '@voucha/test-helpers'
import { reconcileTestDeliveryRepairMarker } from '@voucha/test-helpers/entities/media-delivery-repair'
import {
  hasCopyrightRegistryReplayAudit,
  readCopyrightCaseLifecycleClock,
} from '@voucha/test-helpers/copyright-lifecycle-clock'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import {
  prepareActionDeliveryRestore,
  actionDeliveryCurrentTuple,
} from '@voucha/test-helpers/copyright-action-delivery-contract-fixtures'
import {
  assertActionAuthorityJob,
  changePreparedActionAuthority,
  actionDeliveryOwner,
  authorityChangedState,
} from '@voucha/test-helpers/copyright-action-delivery-authority-subject'
import { readDeliveryContractState } from '@voucha/test-helpers/copyright-action-delivery-contract-state'
import { assertPreparedActionFinalization } from '@voucha/test-helpers/copyright-action-delivery-finalization-subject'
import { assertDisabledActionDeliveryJob } from '@voucha/test-helpers/copyright-action-delivery-contract-job'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'

describe('copyright action persisted delivery authority', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(['withhold', 'court'] as const)(
    'keeps the whole restore job fail closed after a newer %s commits',
    async kind => {
      expect.hasAssertions()
      const edge = installTestMediaDeliveryEdge()
      const scene = await openHeldCounterNoticeRestore()
      await assertActionAuthorityJob(scene, kind)
      expect(edge.put.mock.calls.every(([record]) => record.state === 'withheld')).toBe(true)
    },
  )

  it.each(['withhold', 'court'] as const)(
    'rechecks a committed %s before the first prepared restored allow can escape',
    async kind => {
      const edge = installTestMediaDeliveryEdge()
      const scene = await openHeldCounterNoticeRestore()
      const prepared = await prepareActionDeliveryRestore(scene)
      const before = await readDeliveryContractState(actionDeliveryOwner(scene))
      const filing = await changePreparedActionAuthority(scene, kind)
      await publishStagedMediaDeliveryRecord(prepared.mediaDeliveryRegistryRecordId)
      expect(await readDeliveryContractState(actionDeliveryOwner(scene))).toEqual(
        authorityChangedState(before, kind, filing),
      )
      const key = getImagePlacementDeliveryKey(prepared)
      expect(edge.records.get(key)?.state).toBe('withheld')
      const calls = edge.put.mock.calls.filter(([record]) => record.deliveryKey === key)
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.every(([record]) => record.state === 'withheld')).toBe(true)
      await assertPreparedActionFinalization(scene, prepared, kind)
    },
  )

  it('reconciles a late court denial without advancing its already completed generation', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const prepared = await prepareActionDeliveryRestore(scene)
    await changePreparedActionAuthority(scene, 'court')
    await publishStagedMediaDeliveryRecord(prepared.mediaDeliveryRegistryRecordId)
    await reconcileTestDeliveryRepairMarker(prepared.mediaDeliveryRegistryRecordId)
    await processMediaDeliveryRegistryRecord(prepared.mediaDeliveryRegistryRecordId)
    const key = getImagePlacementDeliveryKey(prepared)
    const generation = edge.records.get(key)!.generation
    const current = await getImagePlacementForCopyright(scene.target.placement_id)
    if (!current) throw new Error('Copyright placement missing')
    await stageTestImagePlacementDeliveryRecordsForImageIds([current.imageId])
    await expect(
      processMediaDeliveryRegistryRecord(prepared.mediaDeliveryRegistryRecordId),
    ).resolves.toBe('not_claimed')
    await stageTestImagePlacementDeliveryRecordsForImageIds([current.imageId])
    await expect(
      processMediaDeliveryRegistryRecord(prepared.mediaDeliveryRegistryRecordId),
    ).resolves.toBe('not_claimed')
    expect(edge.records.get(key)?.generation).toBe(generation)
    expect(edge.records.get(key)?.state).toBe('withheld')
  })

  it.each([
    ['MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'false'],
    ['MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE', 'off'],
  ])('refuses restoration authority changes while %s is disabled', async (key, value) => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const tuple = await actionDeliveryCurrentTuple(scene.target.placement_id)
    vi.stubEnv(key, value)
    await assertDisabledActionDeliveryJob({
      ...actionDeliveryOwner(scene),
      intentId: scene.restore.id,
      now: scene.restorationAt,
      message:
        key === 'MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED'
          ? 'Media delivery report and enforcement require registry publication'
          : 'Media delivery enforcement requires both registry publication and edge enforcement',
    })
    // This independent real guard must run even if the worker's serializable claim aborted.
    const before = await readDeliveryContractState(actionDeliveryOwner(scene))
    await expect(prepublishCopyrightImagePlacementDenial(tuple)).rejects.toThrow(
      'registry publication',
    )
    expect(await readDeliveryContractState(actionDeliveryOwner(scene))).toEqual(before)
  })

  it('retains replay audit foreign keys without changing the legal case clock', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const tuple = await actionDeliveryCurrentTuple(scene.target.placement_id)
    const { mediaDeliveryRegistryRecordId } = await stageImagePlacementDeliveryRecord({
      ...tuple,
      state: 'allow',
    })
    await markTestMediaDeliveryRecordFailed(mediaDeliveryRegistryRecordId)
    const clock = await readCopyrightCaseLifecycleClock(scene.notice.id)
    expect(clock).toBeInstanceOf(Date)
    await expect(
      replayFailedMediaDeliveryRegistryRecords({
        actorUserId: scene.moderator.id,
        recordIds: [mediaDeliveryRegistryRecordId],
      }),
    ).resolves.toMatchObject({ replayed: 1 })
    expect(await readCopyrightCaseLifecycleClock(scene.notice.id)).toEqual(clock)
    expect(
      await hasCopyrightRegistryReplayAudit(
        scene.notice.id,
        mediaDeliveryRegistryRecordId,
        scene.moderator.id,
      ),
    ).toBe(true)
    expect(await getTestMediaDeliveryRecord(mediaDeliveryRegistryRecordId)).toMatchObject({
      state: 'pending',
    })
  })
})
