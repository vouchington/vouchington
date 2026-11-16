import { raceCopyrightCompensationWithLateHold } from '@voucha/test-helpers/copyright-compensation-late-hold-race'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'
import { prepareCopyrightAction } from './action-delivery-preparation.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers/entities/media-delivery-retry'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { publishStagedMediaDeliveryRecord } from '@services/media-delivery-safety'
import { processCopyrightActionIntent } from './action-delivery-process.mts'

describe('copyright restore compensation lease ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('preserves a newer completed same-tuple allow after compensation already read the old lease', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await openHeldCounterNoticeRestore()
    const originalError = new Error('The provider receipt failed after accepting the allow.')
    let compensating = false
    let recordId = ''
    let deliveryKey = ''
    let winner: Awaited<ReturnType<typeof readMediaDeliveryRegistryItem>>
    let winnerSnapshot: Record<string, unknown> | null = null
    const restore = afterPostgresTransactionQueryForTest(
      '/* failCopyrightActionIntent:lock */',
      values => compensating && values.includes(scene.restore.id),
      async () => {
        await expect(
          processCopyrightActionIntent(scene.restore.id, new Date(Date.now() + 6 * 60_000)),
        ).resolves.toBe('applied')
        winner = await readMediaDeliveryRegistryItem(deliveryKey)
        winnerSnapshot = await getTestMediaDeliveryRecordSnapshot(recordId)
      },
    )
    try {
      await expect(
        processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
          publishStagedMediaDeliveryRecord: async id => {
            recordId = id
            await publishStagedMediaDeliveryRecord(id)
            const tuple = await getImagePlacementForCopyright(scene.target.placement_id)
            if (!tuple) throw new Error('Restored placement disappeared')
            deliveryKey = getImagePlacementDeliveryKey({
              placementId: tuple.placementId,
              revision: tuple.revision,
              imageId: tuple.imageId,
            })
            compensating = true
            throw originalError
          },
        }),
      ).rejects.toBe(originalError)
    } finally {
      restore()
    }
    expect(winner).toMatchObject({ state: 'allow' })
    expect(await readMediaDeliveryRegistryItem(deliveryKey)).toEqual(winner)
    expect(await getTestMediaDeliveryRecordSnapshot(recordId)).toEqual(winnerSnapshot)
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
        row => row.id === scene.restore.id,
      ),
    ).toMatchObject({ state: 'completed', attempt_count: 2 })
  })
  it('retains a qualifying late hold admitted before compensation renews its lease', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await openHeldCounterNoticeRestore()
    const claimed = await claimCopyrightActionIntent(scene.restore.id, scene.restorationAt)
    if (!claimed) throw new Error('Restore could not be claimed')
    const prepared = await prepareCopyrightAction(claimed, scene.restorationAt)
    if (typeof prepared === 'string' || !prepared.mediaDeliveryRegistryRecordId)
      throw new Error('Restore could not be prepared')
    await publishStagedMediaDeliveryRecord(prepared.mediaDeliveryRegistryRecordId)
    const tuple = {
      placementId: prepared.placement.placementId,
      revision: prepared.placement.revision,
      imageId: prepared.placement.imageId,
    }
    const deliveryKey = getImagePlacementDeliveryKey(tuple)
    expect(await readMediaDeliveryRegistryItem(deliveryKey)).toMatchObject({ state: 'allow' })
    const originalError = new Error('Provider receipt failed before compensation.')
    const outcomes = await raceCopyrightCompensationWithLateHold({
      placementId: tuple.placementId,
      hold: () => recordOrdinaryCopyrightHold(scene),
      compensate: () =>
        compensateCopyrightActionFailure(claimed, scene.restorationAt, tuple, originalError),
    })
    expect(outcomes[0]).toEqual({ status: 'rejected', reason: originalError })
    expect(outcomes[1].status).toBe('fulfilled')
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
      state: 'blocked',
    })
    expect(after?.holdAssessments).toHaveLength(1)
    expect((await getImagePlacementForCopyright(tuple.placementId))?.withheld).toBe(true)
    expect(await readMediaDeliveryRegistryItem(deliveryKey)).toMatchObject({ state: 'withheld' })
  })
})
