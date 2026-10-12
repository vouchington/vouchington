import { Queue, Worker } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { createEmptyEmbeddingCreationWorker } from '@voucha/test-helpers/embedding-creation-empty'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

/** Owns real queue resources without borrowing the quota/configuration fixture. */
async function ownQueue(label: string) {
  let closing = false
  let disposed = false
  let drain: (() => Promise<void>) | undefined
  let safeAfterFailure: (() => boolean) | undefined
  const close = async () => {
    closing = true
    const [result] = await Promise.allSettled([Promise.resolve().then(() => drain?.())])
    disposed = result!.status === 'fulfilled' || (safeAfterFailure?.() ?? false)
    return result!
  }
  onTestFinished(async () => {
    if (!disposed) {
      const result = await close()
      if (result.status === 'rejected') throw result.reason
    }
  })
  try {
    const owned = createOwnedEmbeddingQueue(
      {
        assertOpen() {
          if (closing) throw new Error('Control owner is closing')
        },
        beforeRelease(run, safe) {
          if (closing) throw new Error('Control owner is closing')
          drain = run
          safeAfterFailure = safe
        },
      },
      label,
      { connection: workerQueueConnection, prefix: workerQueuePrefix },
    )
    return { owned, close, safelyDrained: () => disposed }
  } catch (err) {
    const result = await close()
    if (result.status === 'rejected')
      throw new AggregateError([err, result.reason], 'Control construction and cleanup failed', {
        cause: err,
      })
    throw err
  }
}

describe('owned embedding cleanup failures', () => {
  it('retains factory rejection while recognizing that no physical worker remains', async () => {
    const owner = await ownQueue('factory_failure')
    // Same owned identity, independent closed handle: the real factory rejects in setGlobalConcurrency.
    let closedQueue: Queue | undefined
    onTestFinished(() => closedQueue?.close())
    closedQueue = new Queue(owner.owned.queue.name, owner.owned.options)
    await closedQueue.close()
    const rejectedQueue = closedQueue
    const [creation] = await Promise.allSettled([
      owner.owned.createWorker(() => createEmptyEmbeddingCreationWorker(rejectedQueue)),
    ])
    expect(creation!.status).toBe('rejected')
    if (creation!.status !== 'rejected')
      throw new Error('Expected native factory precondition failure')
    const primary: unknown = creation!.reason
    const result = await owner.close()
    expect(result.status).toBe('rejected')
    if (result.status !== 'rejected') throw new Error('Expected retained factory failure')
    expect(result.reason).toBeInstanceOf(AggregateError)
    expect(result.reason.cause).toBe(primary)
    expect(result.reason.errors).toEqual([primary])
    expect(owner.owned.workers).toEqual([])
    expect(owner.safelyDrained()).toBe(true)
  }, 5000)

  it('rejects completion waits before settling a not-delayed promotion operation', async () => {
    const owner = await ownQueue('pending_promotion')
    await owner.owned.ready()
    const job = await owner.owned.add('waiting', {})
    if (!job) throw new Error('Expected owned waiting job')
    const completed = owner.owned.waitFor(job.id, 'completed')
    void completed.catch(() => {})
    const promotionReturned = Promise.withResolvers<void>()
    const promotion = owner.owned.promoteContinuation(
      {
        async promote() {
          try {
            return await job.promote()
          } finally {
            promotionReturned.resolve()
          }
        },
      },
      completed,
    )
    void promotion.catch(() => {})
    await promotionReturned.promise
    const result = await owner.close()
    expect(result.status).toBe('rejected')
    await expect(completed).rejects.toThrow('Owned embedding queue closed')
    await expect(promotion).rejects.toThrow('Owned embedding queue closed')
    expect(owner.safelyDrained()).toBe(true)
    expect(owner.owned.diagnostics().pending).toEqual([
      { id: job.id, event: 'completed', occurrence: 1 },
    ])
  }, 5000)

  it('retains observed terminal history after run has deleted and closed the owned queue', async () => {
    const owner = await ownQueue('retained_diagnostics')
    const worker = await owner.owned.createWorker(
      () =>
        new Worker(owner.owned.queue.name, async () => 'observed', {
          ...owner.owned.options,
          blockTimeout: 100,
        }),
    )
    let id: string | undefined
    await owner.owned.run(async () => {
      await Promise.all([owner.owned.ready(), worker.waitUntilReady()])
      const job = await owner.owned.add('observed', {})
      if (!job) throw new Error('Expected owned job')
      id = job.id
      await owner.owned.waitFor(job.id, 'completed')
    })
    const result = await owner.close()
    expect(result.status).toBe('fulfilled')
    expect(owner.owned.diagnostics()).toMatchObject({
      closing: true,
      writersDrained: true,
      history: [{ id, events: { completed: 1 } }],
    })
  }, 5000)
})
