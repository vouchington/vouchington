import { describe, expect, it, vi } from 'vitest'
import { skipActivityPubInboxEnqueueGrace } from '@voucha/test-helpers/activitypub-inbox-enqueue-grace'
import { recoverDeliveries } from './inbox-recovery.mts'

type RecoverDeliveriesDependencies = NonNullable<Parameters<typeof recoverDeliveries>[1]>

const rows = ['a', 'b', 'c'].map(id => ({ deliveryId: `delivery-${id}`, requestDigest: id }))
type Status = Awaited<ReturnType<RecoverDeliveriesDependencies['getJobStatus']>>

function dependenciesFor(statusOf: (digest: string) => Status | Error) {
  const enqueueContinuation = vi.fn<RecoverDeliveriesDependencies['enqueueContinuation']>()
  const reserveRequeues = vi.fn<RecoverDeliveriesDependencies['reserveRequeues']>(
    async ids => new Map(ids.map(id => [id, 1])),
  )
  const enqueueBulk = vi.fn<RecoverDeliveriesDependencies['enqueueBulk']>(
    async inputs =>
      // The queue answers with the job ids the production helper derives from each digest.
      inputs.map(input => ({ id: `activitypub-inbox__${input.requestDigest}` })) as never,
  )
  const exhaust = vi.fn<RecoverDeliveriesDependencies['exhaust']>(async () => ({
    outcome: 'applied',
    value: undefined,
  }))
  const removeFailed = vi.fn<RecoverDeliveriesDependencies['removeFailed']>(async () => true)
  const dependencies: RecoverDeliveriesDependencies = {
    readRecoverable: async () => rows,
    getJobStatus: async data => {
      const status = statusOf(data.requestDigest)
      if (status instanceof Error) throw status
      return status
    },
    exhaust,
    removeFailed,
    reserveRequeues,
    releaseUnadmittedRequeues: async () => undefined as never,
    exhaustRecoveryRequeues: async () => undefined as never,
    enqueueBulk,
    enqueueContinuation,
    pageSize: () => rows.length,
  }
  return { dependencies, enqueueContinuation, reserveRequeues, enqueueBulk, exhaust, removeFailed }
}

describe('recoverDeliveries with a poison row', () => {
  it('recovers the later rows and advances the cursor when one lookup throws', async () => {
    const lookup = new Error('valkey lookup failed')
    skipActivityPubInboxEnqueueGrace()
    const run = dependenciesFor(digest => (digest === 'b' ? lookup : { state: 'missing' }))

    await expect(recoverDeliveries(undefined, run.dependencies)).rejects.toBe(lookup)

    expect(run.reserveRequeues).toHaveBeenCalledExactlyOnceWith(['delivery-a', 'delivery-c'])
    expect(run.enqueueBulk).toHaveBeenCalledExactlyOnceWith([rows[0], rows[2]])
    expect(run.enqueueContinuation).toHaveBeenCalledExactlyOnceWith('delivery-c')
  })

  it('keeps checkpointing later failed rows when one checkpoint throws', async () => {
    const checkpoint = new Error('checkpoint failed')
    skipActivityPubInboxEnqueueGrace()
    const run = dependenciesFor(() => ({ state: 'failed', reason: 'stalled' }))
    run.exhaust.mockRejectedValueOnce(checkpoint)

    await expect(recoverDeliveries(undefined, run.dependencies)).rejects.toBe(checkpoint)

    expect(run.exhaust).toHaveBeenCalledTimes(3)
    expect(run.removeFailed).toHaveBeenCalledTimes(2)
    expect(run.enqueueContinuation).toHaveBeenCalledExactlyOnceWith('delivery-c')
  })

  it('still continues the cursor when bulk admission throws, then reports every failure', async () => {
    const admission = new Error('bulk admission failed')
    const lookup = new Error('valkey lookup failed')
    skipActivityPubInboxEnqueueGrace()
    const run = dependenciesFor(digest => (digest === 'b' ? lookup : { state: 'missing' }))
    run.enqueueBulk.mockRejectedValueOnce(admission)

    const failure = await recoverDeliveries(undefined, run.dependencies).catch(
      (err: unknown) => err,
    )

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toContain(lookup)
    expect((failure as AggregateError).errors).toContain(admission)
    expect(run.enqueueContinuation).toHaveBeenCalledExactlyOnceWith('delivery-c')
  })
})
