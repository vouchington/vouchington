import {
  afterPostgresTransactionQueryForTest,
  beforePostgresTransactionQueryForTest,
} from '@voucha/test-helpers/injected-postgres-transactions'
import { processCopyrightActionIntent } from './action-delivery-process.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as edge from '@modules/aws/media-delivery-registry'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import { createCopyrightCourtFilingScene } from '@voucha/test-helpers/copyright-court-filing-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { processMediaDeliveryRegistryRecord } from '@services/media-delivery-safety'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { readCopyrightFilingProjection } from '@voucha/test-helpers/copyright-filing-projection'
import { getTestMediaDeliveryTransitionHistory } from '@voucha/test-helpers/entities/media-delivery-retry'
import { listRecoverableMediaDeliveryRegistryIds } from '../media-delivery-safety/delivery-registry-recovery-scan.mts'

describe('atomic court filing publication', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('commits current denial work before any provider publication and preserves historical generations', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const [oldRecord] = await readCopyrightFilingProjection(scene.surface.placementId)
    if (!oldRecord) throw new Error('Initial allow projection missing')
    const historical = await getTestMediaDeliveryTransitionHistory(oldRecord.id)
    const publish = vi.spyOn(edge, 'putMediaDeliveryRegistryRecord')
    const reset = afterPostgresTransactionQueryForTest(
      'stageImagePlacementDeliveryRecords',
      values =>
        values.some(value => Array.isArray(value) && value.includes(scene.surface.placementId)),
      async () => {
        expect(publish).not.toHaveBeenCalled()
        const beforeCommit = await getCopyrightNoticePrivateAggregate(scene.notice.id)
        expect(beforeCommit?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toEqual(
          [],
        )
      },
    )
    try {
      await scene.file()
    } finally {
      reset()
    }
    expect(publish).not.toHaveBeenCalled()
    const committed = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(committed?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
    const [record] = await readCopyrightFilingProjection(scene.surface.placementId)
    expect(record).toMatchObject({ desired_state: 'withheld', state: 'pending' })
    if (!record) throw new Error('Committed denial projection missing')
    expect(record.placement_revision).toBeGreaterThan(oldRecord.placement_revision)
    expect(await getTestMediaDeliveryTransitionHistory(oldRecord.id)).toEqual(historical)
    const recovery = await listRecoverableMediaDeliveryRegistryIds({
      limit: 1,
      scanBefore: new Date().toISOString(),
      recordIds: [record.id],
    })
    expect(recovery.results).toEqual([record.id])
    await expect(processMediaDeliveryRegistryRecord(record.id)).resolves.toBe('completed')
    expect(publish).toHaveBeenCalledOnce()
    const current = await getImagePlacementForCopyright(scene.surface.placementId)
    if (!current) throw new Error('Filing target disappeared')
    expect(
      await readMediaDeliveryRegistryItem(
        getImagePlacementDeliveryKey({
          placementId: current.placementId,
          revision: current.revision,
          imageId: current.imageId,
        }),
      ),
    ).toMatchObject({ state: 'withheld' })
  })

  it('rolls back staged denial work without publishing when admission fails before commit', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const before = await getImagePlacementForCopyright(scene.surface.placementId)
    const projection = await readCopyrightFilingProjection(scene.surface.placementId)
    const publish = vi.spyOn(edge, 'putMediaDeliveryRegistryRecord')
    const reset = afterPostgresTransactionQueryForTest(
      'stageImagePlacementDeliveryRecords',
      values =>
        values.some(value => Array.isArray(value) && value.includes(scene.surface.placementId)),
      async () => {
        throw new Error('Owned admission failed after staging')
      },
    )
    try {
      await expect(scene.file()).rejects.toThrow('Owned admission failed after staging')
    } finally {
      reset()
    }
    expect(publish).not.toHaveBeenCalled()
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toEqual([])
    expect(after?.restrictions).toEqual([])
    expect(
      after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
    ).toEqual([])
    expect(await getImagePlacementForCopyright(scene.surface.placementId)).toEqual(before)
    expect(await readCopyrightFilingProjection(scene.surface.placementId)).toEqual(projection)
  })

  it('keeps committed filing authority and recoverable work when postcommit provider publication fails', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    await scene.file()
    const [record] = await readCopyrightFilingProjection(scene.surface.placementId)
    if (!record) throw new Error('Committed denial projection missing')
    vi.spyOn(edge, 'putMediaDeliveryRegistryRecord').mockRejectedValueOnce(
      new Error('Owned provider failure'),
    )
    await expect(processMediaDeliveryRegistryRecord(record.id)).rejects.toThrow(
      'Owned provider failure',
    )
    const committed = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(committed?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
    expect(committed?.restrictions).toHaveLength(1)
    expect((await getImagePlacementForCopyright(scene.surface.placementId))?.withheld).toBe(true)
    const history = await getTestMediaDeliveryTransitionHistory(record.id)
    expect(history.at(-1)).toMatchObject({ change_type: 'pending' })
    expect(history.some(row => row.change_type === 'completed')).toBe(false)
  })

  it('stages the current denial after another case restores before its placement check', async () => {
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
    const reset = beforePostgresTransactionQueryForTest(
      'lockCopyrightPlacementTransitions',
      values =>
        values.some(value => Array.isArray(value) && value.includes(first.surface.placementId)),
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
      await expect(second.file()).resolves.toMatchObject({ kind: 'court_or_ccb_hold' })
    } finally {
      reset()
    }
    if (!restored) throw new Error('Restore did not cross the owned filing boundary')
    const current = await getImagePlacementForCopyright(first.surface.placementId)
    if (!current) throw new Error('Current filing placement disappeared')
    const [projection] = await readCopyrightFilingProjection(current.placementId)
    if (!projection) throw new Error('Current filing denial missing')
    await processMediaDeliveryRegistryRecord(projection.id)
    expect(
      await readMediaDeliveryRegistryItem(
        getImagePlacementDeliveryKey({
          placementId: current.placementId,
          revision: current.revision,
          imageId: current.imageId,
        }),
      ),
    ).toMatchObject({ state: 'withheld' })
    expect(current.withheld).toBe(true)
    const admittedFiling = await getCopyrightNoticePrivateAggregate(second.notice.id)
    expect(
      admittedFiling?.submissions.filter(row => row.kind === 'court_or_ccb_hold'),
    ).toHaveLength(1)
    expect(admittedFiling?.restrictions).toHaveLength(1)
  })
})
