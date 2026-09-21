import { describe, expect, it } from 'vitest'
import { enqueueReconcileChatRuntimeGenerations } from './reconcile-chat-runtime-generations.mts'

describe('enqueueReconcileChatRuntimeGenerations', () => {
  it('enqueues the chat runtime reconciler with scheduler-equivalent options', async () => {
    const job = await enqueueReconcileChatRuntimeGenerations()
    if (!job) throw new Error('Expected the chat runtime reconciliation job')
    expect(job.name).toBe('reconcile-chat-runtime-generations')
    expect(job.data).toEqual({})
    expect(job.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 100,
    })
  })
})
