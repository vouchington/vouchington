import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { processCopyrightActionIntent } from './action-delivery-process.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as edge from '@modules/aws/media-delivery-registry'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import { createCopyrightCourtFilingScene } from '@voucha/test-helpers/copyright-court-filing-scene'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  stageImagePlacementDeliveryRecord,
  publishStagedMediaDeliveryRecord,
} from '@services/media-delivery-safety'
import { getMediaDeliverySafetyWorkLimit } from '../media-delivery-safety/work-limits.mts'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'

describe('atomic court filing publication', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('denies every current tuple before commit across provider chunks', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const surfaces = await Promise.all(
      Array.from({ length: getMediaDeliverySafetyWorkLimit('edge_publish_batch_size') + 1 }, () =>
        createTestCopyrightImageFixture('user-profile-image'),
      ),
    )
    const scene = await createCopyrightCourtFilingScene({
      surface: surfaces[0]!,
      additionalSurfaces: surfaces.slice(1),
    })
    for (const surface of surfaces.slice(1)) {
      const staged = await stageImagePlacementDeliveryRecord({
        placementId: surface.placementId,
        revision: surface.placementRevision,
        imageId: surface.imageId,
        state: 'allow',
      })
      await publishStagedMediaDeliveryRecord(staged.mediaDeliveryRegistryRecordId)
    }
    await scene.file()
    for (const surface of surfaces) {
      const current = await getImagePlacementForCopyright(surface.placementId)
      if (!current) throw new Error('Filing target disappeared')
      expect(current.withheld).toBe(true)
      expect(
        await readMediaDeliveryRegistryItem(
          getImagePlacementDeliveryKey({
            placementId: current.placementId,
            revision: current.revision,
            imageId: current.imageId,
          }),
        ),
      ).toMatchObject({ state: 'withheld' })
    }
  })

  it('does not commit filing authority or placement withholding when provider denial fails', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const before = await getImagePlacementForCopyright(scene.surface.placementId)
    vi.spyOn(edge, 'putMediaDeliveryRegistryRecord').mockRejectedValueOnce(
      new Error('Owned provider denial failed'),
    )
    await expect(scene.file()).rejects.toThrow('Owned provider denial failed')
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toEqual([])
    expect(after?.restrictions).toEqual([])
    expect(
      after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
    ).toEqual([])
    expect(await getImagePlacementForCopyright(scene.surface.placementId)).toEqual(before)
  })

  it('rejects filing after a different case fully restores an already-withheld placement beyond its final tuple read', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const first = await createCopyrightCourtFilingScene()
    const second = await createCopyrightCourtFilingScene({ surface: first.surface })
    const initial = await first.file()
    await first.assess(initial.id, false)
    const restoreIntent = (
      await getCopyrightNoticePrivateAggregate(first.notice.id)
    )?.actionIntents.find(row => row.action === 'restore' && row.state === 'pending')
    if (!restoreIntent) throw new Error('Initial ground did not release restoration work')
    let restored: Awaited<ReturnType<typeof getImagePlacementForCopyright>> = null
    const reset = afterPostgresTransactionQueryForTest(
      'denyCopyrightCourtFilingPlacements:current',
      values => values.includes(second.notice.id),
      async () => {
        await expect(processCopyrightActionIntent(restoreIntent.id)).resolves.toBe('applied')
        restored = await getImagePlacementForCopyright(first.surface.placementId)
        if (!restored) throw new Error('Live restoration placement disappeared')
        expect(
          await readMediaDeliveryRegistryItem(
            getImagePlacementDeliveryKey({
              placementId: restored.placementId,
              revision: restored.revision,
              imageId: restored.imageId,
            }),
          ),
        ).toMatchObject({ state: 'allow' })
      },
    )
    try {
      await expect(second.file()).rejects.toMatchObject({ status: 409 })
    } finally {
      reset()
    }
    if (!restored) throw new Error('Restore did not cross the owned filing boundary')
    const current = await getImagePlacementForCopyright(first.surface.placementId)
    if (!current) throw new Error('Current filing placement disappeared')
    expect(
      await readMediaDeliveryRegistryItem(
        getImagePlacementDeliveryKey({
          placementId: current.placementId,
          revision: current.revision,
          imageId: current.imageId,
        }),
      ),
    ).toMatchObject({ state: 'allow' })
    const rejectedFiling = await getCopyrightNoticePrivateAggregate(second.notice.id)
    expect(rejectedFiling?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toEqual([])
    expect(rejectedFiling?.restrictions).toEqual([])
  })
})
