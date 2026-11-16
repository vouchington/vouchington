import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { describe, expect, it } from 'vitest'
import { UnrecoverableError } from 'glide-mq'
import { getReviewDisputeRunStatus } from '@voucha/test-helpers'
import { createTestReviewDisputeWithRun } from '@voucha/test-helpers/review-dispute-run-fixture'
import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { AIAgentJobPayloads } from '@queues/ai-agents/types'
import { withDurableRerunOutcome } from './durable-rerun-outcomes.mts'

describe('withDurableRerunOutcome dispute runs', () => {
  it('marks the exact dispute run failed when the job fails permanently', async () => {
    const { disputeId, runId } = await createTestReviewDisputeWithRun()
    const job = {
      id: `dispute_resolution_${runId}`,
      name: 'dispute-resolution',
      data: { dispute_id: disputeId, run_id: runId },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as NamedQueueJob<AIAgentJobPayloads>

    await expect(
      withDurableRerunOutcome(job, async () => {
        throw new UnrecoverableError('Owned permanent failure')
      }),
    ).rejects.toThrow('Owned permanent failure')

    expect(await getReviewDisputeRunStatus(runId)).toBe('failed')
  })
})
