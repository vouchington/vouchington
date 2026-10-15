import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { rearmFailedDeliveries, recoverDeliveries } from '../processors/inbox.mts'

const PAGE_SIZE = 3

describe('ActivityPub inbox recovery processors', () => {
  it('bulk-enqueues only the recoverable deliveries returned by the recovery boundary', async () => {
    const deliveries = makeDeliveries(2)
    const enqueueBulk = vi.fn<VitestLooseMock>().mockResolvedValue([])

    await expect(
      recoverDeliveries({ claimRecoverable: async () => deliveries, enqueueBulk }),
    ).resolves.toEqual({ enqueued: 2 })
    expect(enqueueBulk).toHaveBeenCalledWith(deliveries)
  })

  it('re-arms one short page of failed deliveries without a continuation', async () => {
    const page = makeDeliveries(PAGE_SIZE - 1)
    const { dependencies, rearmFailed, enqueueBulk, enqueueContinuation } = rearmBoundary([page])

    await expect(rearmFailedDeliveries('after-id', dependencies)).resolves.toEqual({
      enqueued: PAGE_SIZE - 1,
      hasMore: false,
    })
    expect(rearmFailed).toHaveBeenCalledOnce()
    expect(rearmFailed).toHaveBeenCalledWith('after-id')
    expect(enqueueBulk).toHaveBeenCalledWith(page)
    expect(enqueueContinuation).not.toHaveBeenCalled()
  })

  it('continues a full page from its largest delivery id instead of draining in one job', async () => {
    const page = makeDeliveries(PAGE_SIZE)
    const { dependencies, rearmFailed, enqueueContinuation } = rearmBoundary([page])

    await expect(rearmFailedDeliveries(undefined, dependencies)).resolves.toEqual({
      enqueued: PAGE_SIZE,
      hasMore: true,
    })
    expect(rearmFailed).toHaveBeenCalledOnce()
    expect(enqueueContinuation).toHaveBeenCalledWith(
      page.map(delivery => delivery.deliveryId).toSorted()[PAGE_SIZE - 1],
    )
  })

  it('does nothing when no failed delivery is left', async () => {
    const { dependencies, enqueueBulk } = rearmBoundary([[]])

    await expect(rearmFailedDeliveries(undefined, dependencies)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    expect(enqueueBulk).not.toHaveBeenCalled()
  })

  it('does not continue when the bulk enqueue fails', async () => {
    const enqueueError = new Error('bulk enqueue failed')
    const { dependencies, enqueueContinuation } = rearmBoundary([makeDeliveries(PAGE_SIZE)])
    dependencies.enqueueBulk = vi.fn<VitestLooseMock>().mockRejectedValue(enqueueError)

    await expect(rearmFailedDeliveries(undefined, dependencies)).rejects.toBe(enqueueError)
    expect(enqueueContinuation).not.toHaveBeenCalled()
  })
})

function rearmBoundary(pages: ReturnType<typeof makeDeliveries>[]) {
  const rearmFailed = vi.fn<VitestLooseMock>()
  for (const page of pages) rearmFailed.mockResolvedValueOnce(page)
  const enqueueBulk = vi.fn<VitestLooseMock>().mockResolvedValue([])
  const enqueueContinuation = vi.fn<VitestLooseMock>().mockResolvedValue(null)
  return {
    rearmFailed,
    enqueueBulk,
    enqueueContinuation,
    dependencies: { rearmFailed, enqueueBulk, enqueueContinuation, pageSize: () => PAGE_SIZE },
  }
}

function makeDeliveries(count: number) {
  return Array.from({ length: count }, () => ({
    deliveryId: randomUUID(),
    leaseToken: randomUUID(),
  }))
}
