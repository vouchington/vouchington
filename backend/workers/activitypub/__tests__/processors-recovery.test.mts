import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { INBOX_RECOVERY_ENQUEUE_GRACE_MS } from '@queues/activitypub/config'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { rearmFailedDeliveries, recoverDeliveries } from '../processors/inbox.mts'

const PAGE_SIZE = 3

describe('ActivityPub inbox recovery processors', () => {
  it('bulk-enqueues only the recoverable deliveries returned by the recovery boundary', async () => {
    const deliveries = makeDeliveries(2)
    const enqueueBulk = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(
        deliveries.map(delivery => ({ id: `activitypub-inbox__${delivery.requestDigest}` })),
      )

    await expect(
      recoverDeliveries(undefined, {
        readRecoverable: async () => deliveries,
        getJobStatus: async () => ({ state: 'missing' }),
        reserveRequeues: async deliveryIds => new Map(deliveryIds.map(id => [id, 1])),
        releaseUnadmittedRequeues: async () => undefined,
        exhaustRecoveryRequeues: async () => undefined,
        removeFailed: async () => false,
        exhaust: async () => ({ outcome: 'stale' }),
        enqueueBulk,
        enqueueContinuation: async () => null,
        pageSize: () => PAGE_SIZE,
      }),
    ).resolves.toEqual({ enqueued: 2, hasMore: false })
    expect(enqueueBulk).toHaveBeenCalledWith(deliveries)
  })

  it.each(['missing', 'stale-terminal'] as const)(
    'refunds an unadmitted %s replacement when queue admission rejects',
    async state => {
      const deliveries = makeDeliveries(1)
      const admissionError = new Error('Valkey unavailable')
      const releaseUnadmittedRequeues = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
      const enqueueContinuation = vi.fn<VitestLooseMock>().mockResolvedValue(null)
      await expect(
        recoverDeliveries(undefined, {
          readRecoverable: async () => deliveries,
          getJobStatus: async () => ({ state }),
          exhaust: async () => ({ outcome: 'stale' }),
          removeFailed: async () => false,
          reserveRequeues: async deliveryIds => new Map(deliveryIds.map(id => [id, 1])),
          releaseUnadmittedRequeues,
          exhaustRecoveryRequeues: async () => undefined,
          enqueueBulk: async () => {
            throw admissionError
          },
          enqueueContinuation,
          pageSize: () => PAGE_SIZE,
        }),
      ).rejects.toBe(admissionError)
      expect(releaseUnadmittedRequeues).toHaveBeenCalledWith([
        { deliveryId: deliveries[0]!.deliveryId, count: 1 },
      ])
      expect(enqueueContinuation).not.toHaveBeenCalled()
    },
  )

  it('refunds a replacement reservation when another admission owns the same job id', async () => {
    const deliveries = makeDeliveries(1)
    const releaseUnadmittedRequeues = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    await expect(
      recoverDeliveries(undefined, {
        readRecoverable: async () => deliveries,
        getJobStatus: async () => ({ state: 'missing' }),
        exhaust: async () => ({ outcome: 'stale' }),
        removeFailed: async () => false,
        reserveRequeues: async deliveryIds => new Map(deliveryIds.map(id => [id, 1])),
        releaseUnadmittedRequeues,
        exhaustRecoveryRequeues: async () => undefined,
        enqueueBulk: async () => [],
        enqueueContinuation: async () => null,
        pageSize: () => PAGE_SIZE,
      }),
    ).resolves.toEqual({ enqueued: 0, hasMore: false })
    expect(releaseUnadmittedRequeues).toHaveBeenCalledWith([
      { deliveryId: deliveries[0]!.deliveryId, count: 1 },
    ])
  })

  it('retains the reservation when a failed admission cannot be checked in Valkey', async () => {
    const deliveries = makeDeliveries(1)
    const admissionError = new Error('bulk admission unavailable')
    const lookupError = new Error('job status unavailable')
    const releaseUnadmittedRequeues = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    let statusReads = 0

    await expect(
      recoverDeliveries(undefined, {
        readRecoverable: async () => deliveries,
        getJobStatus: async () => {
          statusReads += 1
          if (statusReads === 1) return { state: 'missing' }
          throw lookupError
        },
        exhaust: async () => ({ outcome: 'stale' }),
        removeFailed: async () => false,
        reserveRequeues: async deliveryIds => new Map(deliveryIds.map(id => [id, 1])),
        releaseUnadmittedRequeues,
        exhaustRecoveryRequeues: async () => undefined,
        enqueueBulk: async () => {
          throw admissionError
        },
        enqueueContinuation: async () => null,
        pageSize: () => PAGE_SIZE,
      }),
    ).rejects.toMatchObject({
      errors: [admissionError, lookupError],
      cause: admissionError,
    })
    expect(releaseUnadmittedRequeues).toHaveBeenCalledWith([])
  })

  it('does not spend a replacement on an envelope still inside the enqueue grace', async () => {
    const nowMs = 1_700_000_000_000
    const recent = {
      deliveryId: timestampToUuidv7LowerBound(nowMs - 1_000),
      requestDigest: randomUUID(),
    }
    const ready = {
      deliveryId: timestampToUuidv7LowerBound(nowMs - INBOX_RECOVERY_ENQUEUE_GRACE_MS),
      requestDigest: randomUUID(),
    }
    const reserveRequeues = vi
      .fn<VitestLooseMock>()
      .mockImplementation(async (deliveryIds: string[]) => new Map(deliveryIds.map(id => [id, 1])))
    const enqueueBulk = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue([{ id: `activitypub-inbox__${ready.requestDigest}` }])

    await expect(
      recoverDeliveries(undefined, {
        readRecoverable: async () => [ready, recent],
        getJobStatus: async () => ({ state: 'missing' }),
        reserveRequeues,
        releaseUnadmittedRequeues: async () => undefined,
        exhaustRecoveryRequeues: async () => undefined,
        removeFailed: async () => false,
        exhaust: async () => ({ outcome: 'stale' }),
        enqueueBulk,
        enqueueContinuation: async () => null,
        pageSize: () => PAGE_SIZE,
        now: () => nowMs,
      }),
    ).resolves.toEqual({ enqueued: 1, hasMore: false })
    expect(reserveRequeues).toHaveBeenCalledWith([ready.deliveryId])
    expect(enqueueBulk).toHaveBeenCalledWith([ready])
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
    // The largest id sits in the middle, so the pairwise maximum is exercised in both directions.
    const page = (
      [
        '00000000-0000-7000-8000-000000000002',
        '00000000-0000-7000-8000-000000000003',
        '00000000-0000-7000-8000-000000000001',
      ] as const
    ).map(deliveryId => ({
      deliveryId,
      requestDigest: randomUUID(),
    }))
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
    requestDigest: randomUUID(),
  }))
}
