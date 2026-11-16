import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUserDirect, getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import {
  setTestMediaRecoveryState,
  withTestMediaRecoveryBacklog,
} from '@voucha/test-helpers/media-delivery-recovery'
import { processMediaDeliveryRegistryRecord } from './delivery-registry-process.mts'
import { failExpiredExhaustedMediaDeliveryRegistryRecords } from './delivery-registry-recovery-scan.mts'

describe('media delivery written authority races', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('publishes an owned generation once across concurrent processors', async () => {
    const fixture = await createTestDeliverySurface()
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const outcomes = await Promise.all([
      processMediaDeliveryRegistryRecord(fixture.mediaDeliveryRegistryRecordId),
      processMediaDeliveryRegistryRecord(fixture.mediaDeliveryRegistryRecordId),
    ])
    expect(outcomes.toSorted()).toEqual(['completed', 'not_claimed'])
    const record = await getTestMediaDeliveryRecordSnapshot(fixture.mediaDeliveryRegistryRecordId)
    expect(record).toMatchObject({ state: 'completed', desired_state: 'allow' })
    await expect(readMediaDeliveryRegistryItem(fixture.deliveryKey)).resolves.toEqual({
      state: 'allow',
      generation: String(record?.generation),
    })
  })

  it('terminalizes an owned expired final lease once across concurrent recovery scans', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklog(user.id, 2, async ({ recordIds, scanBefore }) => {
      const expiredAt = new Date(new Date(scanBefore).getTime() - 6 * 60_000).toISOString()
      await setTestMediaRecoveryState(recordIds, { state: 'claimed', attempts: 5, at: expiredAt })
      const ownedId = recordIds[0]!
      const untouchedId = recordIds[1]!
      const untouched = await getTestMediaDeliveryRecordSnapshot(untouchedId)
      const outcomes = await Promise.all([
        failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, [ownedId], 1),
        failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, [ownedId], 1),
      ])
      expect(outcomes.toSorted((a, b) => a - b)).toEqual([0, 1])
      expect(await getTestMediaDeliveryRecordSnapshot(ownedId)).toMatchObject({ state: 'failed' })
      expect(await getTestMediaDeliveryRecordSnapshot(untouchedId)).toEqual(untouched)
    })
  })
})
