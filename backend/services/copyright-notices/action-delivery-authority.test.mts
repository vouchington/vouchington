import {
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import {
  lockImageDeliveryMutation,
  publishImagePlacementDeliveryRecord,
  publishStagedMediaDeliveryRecord,
  getImagePlacementDeliveryKey,
  replayFailedMediaDeliveryRegistryRecords,
  stageImagePlacementDeliveryRecord,
  stageAllCurrentImagePlacementDeliveryRecords,
  processMediaDeliveryRegistryRecord,
} from '@services/media-delivery-safety'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  beginTransaction,
  getTestMediaDeliveryRecord,
  markTestMediaDeliveryRecordFailed,
} from '@voucha/test-helpers'
import {
  lockTestDeliveryNoticeNowait,
  reconcileTestDeliveryRepairMarker,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import { lockImageDeliveryLegalAuthority } from '../media-delivery-safety/delivery-authority.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendCopyrightNoticeSubmission,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
} from './index.mts'
import { openHeldCounterNoticeRestore } from './restoration-hold-scene.mts'

describe('copyright action persisted delivery authority', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('does not let a paused restore publish an allow after a newer withholding commits', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore(publishImagePlacementDeliveryRecord)
    const prepared = Promise.withResolvers<string>()
    const resume = Promise.withResolvers<void>()
    const restoring = processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
      publishStagedMediaDeliveryRecord: async deliveryKey => {
        prepared.resolve(deliveryKey)
        await resume.promise
        await publishStagedMediaDeliveryRecord(deliveryKey)
      },
    })
    let deliveryKey = ''
    try {
      deliveryKey = await Promise.race([
        prepared.promise,
        restoring.then(() => {
          throw new Error('Restore finished before publication barrier')
        }),
      ])
      const current = await getImagePlacementForCopyright(scene.target.placement_key)
      if (!current) throw new Error('Prepared restoration tuple missing')
      await using transaction = await beginTransaction()
      await lockImageDeliveryMutation(transaction, {
        placementIds: [current.placementId],
        placementOnly: true,
      })
      await publishImagePlacementDeliveryRecord(
        {
          placementId: current.placementId,
          revision: current.revision,
          imageId: current.imageId,
          state: 'withheld',
        },
        { query: transaction },
      )
      const mutation = await withholdImagePlacementForCopyright(
        { placementKey: current.placementKey, expectedRevision: current.revision },
        { query: transaction },
      )
      expect(mutation.status).toBe('applied')
      await transaction.commit()
    } finally {
      resume.resolve()
      await Promise.allSettled([restoring])
    }
    await expect(restoring).resolves.toBe('stale')
    expect(edge.records.get(deliveryKey)?.state).toBe('withheld')
    expect(
      edge.put.mock.calls
        .filter(([record]) => record.deliveryKey === deliveryKey)
        .every(([record]) => record.state === 'withheld'),
    ).toBe(true)
  })

  it('checks a court filing admitted after preparation before the first restored allow can escape', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore(publishImagePlacementDeliveryRecord)
    const prepared = Promise.withResolvers<string>()
    const resume = Promise.withResolvers<void>()
    const restoring = processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
      publishStagedMediaDeliveryRecord: async deliveryKey => {
        prepared.resolve(deliveryKey)
        await resume.promise
        await publishStagedMediaDeliveryRecord(deliveryKey)
      },
    })
    let deliveryKey = ''
    try {
      deliveryKey = await Promise.race([
        prepared.promise,
        restoring.then(() => {
          throw new Error('Restore finished before publication barrier')
        }),
      ])
      await appendCopyrightNoticeSubmission({
        noticeId: scene.notice.id,
        kind: 'court_or_ccb_hold',
        receivedAt: scene.restorationAt,
        sourceKind: 'email',
        submittedByUserId: null,
        bodyCiphertext: `late-filing-${crypto.randomUUID()}`,
      })
    } finally {
      resume.resolve()
      await Promise.allSettled([restoring])
    }
    await expect(restoring).resolves.toBe('stale')
    expect(
      edge.put.mock.calls
        .filter(([record]) => record.deliveryKey === deliveryKey)
        .every(([record]) => record.state === 'withheld'),
    ).toBe(true)
    expect(edge.records.get(deliveryKey)?.state).toBe('withheld')
    await reconcileTestDeliveryRepairMarker(deliveryKey)
    await processMediaDeliveryRegistryRecord(deliveryKey)
    const stableGeneration = edge.records.get(deliveryKey)!.generation
    await stageAllCurrentImagePlacementDeliveryRecords()
    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).resolves.toBe('not_claimed')
    await stageAllCurrentImagePlacementDeliveryRecords()
    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).resolves.toBe('not_claimed')
    expect(edge.records.get(deliveryKey)?.generation).toBe(stableGeneration)
  })

  it.each([
    'MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED',
    'MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED',
  ])('refuses restoration authority changes while %s is disabled', async key => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore(publishImagePlacementDeliveryRecord)
    const before = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const placement = await getImagePlacementForCopyright(scene.target.placement_key)
    vi.stubEnv(key, 'false')
    await expect(
      processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
    ).rejects.toThrow('registry publication and edge enforcement')
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at).toEqual(
      before?.restrictions.find(row => row.id === scene.restriction.id)?.lifted_at,
    )
    expect(await getImagePlacementForCopyright(scene.target.placement_key)).toEqual(placement)
    expect(after?.actionIntents.find(row => row.id === scene.restore.id)?.state).not.toBe(
      'completed',
    )
  })

  it('permits replay audit foreign keys while retaining the notice fence against filing admission', async () => {
    installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore(publishImagePlacementDeliveryRecord)
    const current = await getImagePlacementForCopyright(scene.target.placement_key)
    if (!current) throw new Error('Copyright placement missing')
    const tuple = {
      placementId: current.placementId,
      revision: current.revision,
      imageId: current.imageId,
    }
    const deliveryKey = getImagePlacementDeliveryKey(tuple)
    await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
    await markTestMediaDeliveryRecordFailed(deliveryKey)
    await using authority = await beginTransaction()
    await lockImageDeliveryLegalAuthority(authority, {
      route_kind: 'placement',
      placement_id: current.placementId,
    })
    {
      await using filing = await beginTransaction()
      await expect(lockTestDeliveryNoticeNowait(filing, scene.notice.id)).rejects.toMatchObject({
        code: '55P03',
      })
    }
    const replay = replayFailedMediaDeliveryRegistryRecords({ actorUserId: scene.moderator.id })
    let result: PromiseSettledResult<Awaited<typeof replay>> | undefined
    const observedReplay = replay.then(
      value => {
        result = { status: 'fulfilled', value }
        return value
      },
      reason => {
        result = { status: 'rejected', reason }
      },
    )
    try {
      await vi.waitFor(() => expect(result).toBeDefined())
      if (result?.status === 'rejected') throw result.reason
      expect(await getTestMediaDeliveryRecord(deliveryKey)).toMatchObject({ state: 'pending' })
    } finally {
      await authority.rollback()
      await observedReplay
    }
  })
})
