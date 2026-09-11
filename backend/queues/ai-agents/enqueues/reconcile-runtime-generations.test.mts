import { describe, expect, it } from 'vitest'
import { enqueueReconcileRuntimeGenerations } from './reconcile-runtime-generations.mts'

describe('enqueueReconcileRuntimeGenerations', () => {
  it('enqueues the runtime-generation reconciler with scheduler-equivalent options', async () => {
    const job = await enqueueReconcileRuntimeGenerations()
    if (!job) throw new Error('Expected the runtime reconciliation job')
    expect(job.name).toBe('reconcile-runtime-generations')
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
