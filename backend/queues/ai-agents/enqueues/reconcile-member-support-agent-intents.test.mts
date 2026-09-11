import { describe, expect, it } from 'vitest'
import { enqueueReconcileMemberSupportAgentIntents } from './reconcile-member-support-agent-intents.mts'

describe('enqueueReconcileMemberSupportAgentIntents', () => {
  it('enqueues the member support intent reconciler with scheduler-equivalent options', async () => {
    const job = await enqueueReconcileMemberSupportAgentIntents()
    if (!job) throw new Error('Expected the member support intent reconciliation job')
    expect(job.name).toBe('reconcile-member-support-agent-intents')
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
