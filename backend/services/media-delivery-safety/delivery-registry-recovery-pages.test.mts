import { describe, expect, it } from 'vitest'
import { createTestUserDirect, getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers'
import {
  setTestMediaRecoveryState,
  withTestMediaRecoveryBacklog,
  withLockedTestMediaDeliveryRecord,
} from '@voucha/test-helpers/media-delivery-recovery'
import {
  failExpiredExhaustedMediaDeliveryRegistryRecords,
  listRecoverableMediaDeliveryRegistryKeys,
  replayFailedMediaDeliveryRegistryRecords,
  stageImagePlacementDeliveryRecord,
} from './index.mts'

describe('media registry recovery pages', () => {
  it('preserves a committed replacement generation after an abandoned final claim', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklog(
      user.id,
      1,
      async ({ deliveryKeys, placements, scanBefore }) => {
        const key = deliveryKeys[0]!
        const expiredAt = new Date(new Date(scanBefore).getTime() - 6 * 60_000).toISOString()
        await setTestMediaRecoveryState(deliveryKeys, {
          state: 'claimed',
          attempts: 5,
          at: expiredAt,
        })
        const abandoned = await getTestMediaDeliveryRecordSnapshot(key)
        await stageImagePlacementDeliveryRecord(
          { ...placements[0]!, state: 'withheld' },
          { forceGeneration: true },
        )
        const replacement = await getTestMediaDeliveryRecordSnapshot(key)
        expect(Number(replacement?.generation)).toBeGreaterThan(Number(abandoned?.generation))
        expect(
          await failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, deliveryKeys),
        ).toBe(0)
        expect(await getTestMediaDeliveryRecordSnapshot(key)).toEqual(replacement)
      },
    )
  })
  it('drains 101 records through scoped immutable keysets at one cutoff', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklog(user.id, 102, async ({ deliveryKeys, scanBefore }) => {
      await setTestMediaRecoveryState([deliveryKeys[101]!], {
        state: 'pending',
        attempts: 0,
        at: scanBefore,
        createdAt: '2300-01-01T00:00:00Z',
      })
      const input = { limit: 100, scanBefore, deliveryKeys }
      const first = await listRecoverableMediaDeliveryRegistryKeys(input)
      expect(first.results).toEqual(deliveryKeys.slice(0, 100))
      expect(first.page_info.has_next_page).toBe(true)
      const second = await listRecoverableMediaDeliveryRegistryKeys({
        ...input,
        after: first.page_info.end_cursor!,
      })
      expect(second.results).toEqual([deliveryKeys[100]])
      expect(second.page_info.has_next_page).toBe(false)
      await expect(
        listRecoverableMediaDeliveryRegistryKeys({
          ...input,
          scanBefore: '2300-01-01T00:00:00Z',
          after: first.page_info.end_cursor!,
        }),
      ).rejects.toThrow('Invalid media recovery cursor')
      await expect(
        listRecoverableMediaDeliveryRegistryKeys({
          ...input,
          deliveryKeys: deliveryKeys.slice(1),
          after: first.page_info.end_cursor!,
        }),
      ).rejects.toThrow('Invalid media recovery cursor')
      expect(
        (await listRecoverableMediaDeliveryRegistryKeys({ ...input, deliveryKeys: [] })).results,
      ).toEqual([])
      expect(await failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, [])).toBe(0)
      const exact = await listRecoverableMediaDeliveryRegistryKeys({
        ...input,
        deliveryKeys: deliveryKeys.slice(0, 100),
      })
      expect(exact.results).toHaveLength(100)
      expect(exact.page_info.has_next_page).toBe(false)
    })
  })
  it('terminalizes bounded abandoned final claims without excluding later eligible work', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklog(user.id, 103, async ({ deliveryKeys, scanBefore }) => {
      const expiredAt = new Date(new Date(scanBefore).getTime() - 6 * 60_000).toISOString()
      await setTestMediaRecoveryState(deliveryKeys.slice(0, 102), {
        state: 'claimed',
        attempts: 5,
        at: expiredAt,
      })
      const unrelatedBefore = await getTestMediaDeliveryRecordSnapshot(deliveryKeys[101]!)
      const ownedKeys = [...deliveryKeys.slice(0, 101), deliveryKeys[102]!]
      expect(await failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, ownedKeys)).toBe(
        100,
      )
      expect(
        (
          await listRecoverableMediaDeliveryRegistryKeys({
            limit: 100,
            scanBefore,
            deliveryKeys: ownedKeys,
          })
        ).results,
      ).toEqual([deliveryKeys[102]])
      expect(await getTestMediaDeliveryRecordSnapshot(deliveryKeys[0]!)).toMatchObject({
        state: 'failed',
        delivery_attempt_count: 5,
        claimed_at: expect.any(String),
        failure_message: expect.stringContaining('Operator replay'),
      })
      expect(await failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, ownedKeys)).toBe(1)
      expect(await failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, ownedKeys)).toBe(0)
      expect(await getTestMediaDeliveryRecordSnapshot(deliveryKeys[101]!)).toEqual(unrelatedBefore)
      const outside = deliveryKeys[101]!
      await setTestMediaRecoveryState([outside], { state: 'failed', attempts: 5, at: expiredAt })
      const failedOutside = await getTestMediaDeliveryRecordSnapshot(outside)
      expect(await replayFailedMediaDeliveryRegistryRecords({ deliveryKeys: ownedKeys })).toBe(101)
      expect(await getTestMediaDeliveryRecordSnapshot(deliveryKeys[0]!)).toMatchObject({
        state: 'pending',
        delivery_attempt_count: 0,
        claimed_at: null,
        completed_at: null,
      })
      expect(await getTestMediaDeliveryRecordSnapshot(outside)).toEqual(failedOutside)
      expect(await replayFailedMediaDeliveryRegistryRecords({ deliveryKeys: [] })).toBe(0)
    })
  })
  it('preserves active, completed, locked and nonexhausted records', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklog(user.id, 4, async ({ deliveryKeys, scanBefore }) => {
      const expiredAt = new Date(new Date(scanBefore).getTime() - 6 * 60_000).toISOString()
      await setTestMediaRecoveryState([deliveryKeys[0]!], {
        state: 'claimed',
        attempts: 5,
        at: scanBefore,
      })
      await setTestMediaRecoveryState([deliveryKeys[1]!], {
        state: 'completed',
        attempts: 5,
        at: expiredAt,
      })
      await setTestMediaRecoveryState([deliveryKeys[2]!], {
        state: 'claimed',
        attempts: 4,
        at: expiredAt,
      })
      await setTestMediaRecoveryState([deliveryKeys[3]!], {
        state: 'claimed',
        attempts: 5,
        at: expiredAt,
      })
      const before = await Promise.all(deliveryKeys.map(getTestMediaDeliveryRecordSnapshot))
      await withLockedTestMediaDeliveryRecord(deliveryKeys[3]!, async () => {
        expect(
          await failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, deliveryKeys),
        ).toBe(0)
        expect(await Promise.all(deliveryKeys.map(getTestMediaDeliveryRecordSnapshot))).toEqual(
          before,
        )
      })
      expect(await failExpiredExhaustedMediaDeliveryRegistryRecords(scanBefore, deliveryKeys)).toBe(
        1,
      )
      expect(
        (await listRecoverableMediaDeliveryRegistryKeys({ limit: 100, scanBefore, deliveryKeys }))
          .results,
      ).toEqual([deliveryKeys[2]])
    })
  })
})
