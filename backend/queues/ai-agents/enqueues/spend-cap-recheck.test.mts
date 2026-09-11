import { describe, expect, it } from 'vitest'
import { enqueueOpenAiSpendCapRecheck } from './spend-cap-recheck.mts'

describe('enqueueOpenAiSpendCapRecheck', () => {
  it('enqueues a delayed coordinator with generation-scoped deduplication', async () => {
    const job = await enqueueOpenAiSpendCapRecheck('2026-08-16', 'generation-a', 1_000)
    if (!job) throw new Error('Expected spend-cap recheck job')

    expect(job.data).toEqual({ day: '2026-08-16', generation: 'generation-a' })
    expect(job.opts).toMatchObject({
      delay: 1_000,
      attempts: 2_880,
      backoff: { type: 'fixed', delay: 60_000, jitter: 0 },
      removeOnComplete: true,
      removeOnFail: true,
      priority: 0,
      deduplication: {
        id: 'openai-spend-cap-recheck_2026-08-16_generation-a',
        mode: 'simple',
      },
    })
  })
})
