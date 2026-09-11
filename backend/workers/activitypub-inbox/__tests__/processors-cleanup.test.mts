import { describe, expect, it, vi } from 'vitest'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import {
  cleanupExpiredDeliveries,
  type CleanupExpiredDeliveriesDependencies,
} from '../processors.mts'

type Expire = CleanupExpiredDeliveriesDependencies['expire']
type GetSnapshot = CleanupExpiredDeliveriesDependencies['getSnapshot']
type Log = CleanupExpiredDeliveriesDependencies['log']

const emptySnapshot = {
  retainedRows: 0,
  retainedRawBodyBytes: 0,
  unverifiedRows: 0,
  unverifiedRawBodyBytes: 0,
}

describe('ActivityPub inbox expired-delivery cleanup processor', () => {
  it('spends the bounded batch budget on unverified rows first', async () => {
    const expire = vi.fn<Expire>().mockResolvedValue({
      deletedRows: ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize,
      deletedRawBodyBytes: 1,
    })

    const result = await cleanupExpiredDeliveries({
      expire,
      getSnapshot: async () => emptySnapshot,
      log: vi.fn<Log>(),
    })

    expect(expire).toHaveBeenCalledTimes(ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches)
    expect(expire.mock.calls.every(([category]) => category === 'unverified')).toBe(true)
    expect(result).toMatchObject({
      batches: ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches,
      budgetExhausted: true,
    })
  })

  it('uses remaining non-empty batches for verified operational failures', async () => {
    const expire = vi
      .fn<Expire>()
      .mockResolvedValueOnce({ deletedRows: 12, deletedRawBodyBytes: 120 })
      .mockResolvedValueOnce({ deletedRows: 7, deletedRawBodyBytes: 70 })

    const result = await cleanupExpiredDeliveries({
      expire,
      getSnapshot: async () => emptySnapshot,
      log: vi.fn<Log>(),
    })

    expect(expire.mock.calls.map(([category]) => category)).toEqual([
      'unverified',
      'verified-operational',
    ])
    expect(result).toEqual({
      batches: 2,
      deletedRows: 19,
      deletedRawBodyBytes: 190,
      budgetExhausted: false,
    })
  })

  it('reports exhaustion when a partial final unverified batch consumes the budget', async () => {
    const expire = vi.fn<Expire>()
    expire.mockImplementation(async () => ({
      deletedRows:
        expire.mock.calls.length < ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches
          ? ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize
          : 1,
      deletedRawBodyBytes: 1,
    }))

    const result = await cleanupExpiredDeliveries({
      expire,
      getSnapshot: async () => emptySnapshot,
      log: vi.fn<Log>(),
    })

    expect(expire).toHaveBeenCalledTimes(ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches)
    expect(expire.mock.calls.every(([category]) => category === 'unverified')).toBe(true)
    expect(result).toMatchObject({
      batches: ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches,
      budgetExhausted: true,
    })
  })

  it('logs every committed batch and a successful-run snapshot', async () => {
    const log = vi.fn<Log>()
    await cleanupExpiredDeliveries({
      expire: vi
        .fn<Expire>()
        .mockResolvedValueOnce({ deletedRows: 2, deletedRawBodyBytes: 20 })
        .mockResolvedValueOnce({ deletedRows: 0, deletedRawBodyBytes: 0 }),
      getSnapshot: async () => ({ ...emptySnapshot, retainedRows: 3 }),
      log,
    })

    expect(log.mock.calls.map(([event]) => event)).toEqual([
      {
        event: 'activitypub_inbox_cleanup_batch',
        category: 'unverified',
        deletedRows: 2,
        deletedRawBodyBytes: 20,
      },
      {
        event: 'activitypub_inbox_cleanup_snapshot',
        ...emptySnapshot,
        retainedRows: 3,
        cleanupBatches: 1,
        budgetExhausted: false,
      },
    ])
  })

  it('preserves committed batch logs and rethrows when a later batch fails', async () => {
    const failure = new Error('database unavailable')
    const log = vi.fn<Log>()
    const getSnapshot = vi.fn<GetSnapshot>()
    const expire = vi
      .fn<Expire>()
      .mockResolvedValueOnce({
        deletedRows: ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize,
        deletedRawBodyBytes: 10,
      })
      .mockRejectedValueOnce(failure)

    await expect(cleanupExpiredDeliveries({ expire, getSnapshot, log })).rejects.toBe(failure)
    expect(log).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'activitypub_inbox_cleanup_batch', deletedRows: 500 }),
    )
    expect(getSnapshot).not.toHaveBeenCalled()
  })
})
