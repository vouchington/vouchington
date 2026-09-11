import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { rearmFailedDeliveries, recoverDeliveries } from '../processors.mts'

describe('ActivityPub inbox recovery processors', () => {
  it('bulk-enqueues only the recoverable deliveries returned by the recovery boundary', async () => {
    const deliveries = makeDeliveries(2)
    const enqueueBulk = vi.fn<VitestLooseMock>().mockResolvedValue([])

    await expect(
      recoverDeliveries({ claimRecoverable: async () => deliveries, enqueueBulk }),
    ).resolves.toEqual({ enqueued: 2 })
    expect(enqueueBulk).toHaveBeenCalledWith(deliveries)
  })

  it('drains failed deliveries in sequential batches until the rearm boundary is empty', async () => {
    const firstBatch = makeDeliveries(500)
    const secondBatch = makeDeliveries(1)
    const rearmFailed = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(secondBatch)
      .mockResolvedValueOnce([])
    const enqueueBulk = vi.fn<VitestLooseMock>().mockResolvedValue([])

    await expect(rearmFailedDeliveries({ rearmFailed, enqueueBulk })).resolves.toEqual({
      enqueued: 501,
    })
    expect(rearmFailed).toHaveBeenCalledTimes(3)
    expect(enqueueBulk).toHaveBeenNthCalledWith(1, firstBatch)
    expect(enqueueBulk).toHaveBeenNthCalledWith(2, secondBatch)
  })

  it('stops claiming failed deliveries when a bulk enqueue fails', async () => {
    const rearmFailed = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeDeliveries(500))
      .mockResolvedValueOnce(makeDeliveries(1))
      .mockResolvedValueOnce([])
    const enqueueError = new Error('bulk enqueue failed')
    const enqueueBulk = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(enqueueError)

    await expect(rearmFailedDeliveries({ rearmFailed, enqueueBulk })).rejects.toBe(enqueueError)
    expect(rearmFailed).toHaveBeenCalledTimes(2)
    expect(enqueueBulk).toHaveBeenCalledTimes(2)
  })
})

function makeDeliveries(count: number) {
  return Array.from({ length: count }, () => ({
    deliveryId: randomUUID(),
    processingAttemptId: randomUUID(),
  }))
}
