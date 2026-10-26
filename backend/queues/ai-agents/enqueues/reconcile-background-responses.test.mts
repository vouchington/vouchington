import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import { enqueueReconcileBackgroundResponsesPage } from './reconcile-background-responses.mts'

describe('background response sweep continuation', () => {
  it('uses a deterministic page ID and one ordered lane across phases', async () => {
    const sweepId = randomUUID()
    const input = { phase: 'cleanup' as const, sweepId, page: 2, failedOffset: 40 }
    const jobId = `ai_background_response_reconcile_${sweepId}_cleanup_2`
    try {
      const first = await enqueueReconcileBackgroundResponsesPage(input)
      const duplicate = await enqueueReconcileBackgroundResponsesPage(input)
      expect(first?.id).toBe(jobId)
      expect(duplicate).toBeNull()
      await expect(ai_agents.getJob(jobId)).resolves.toMatchObject({
        data: input,
        opts: {
          removeOnComplete: true,
          priority: AGENT_PRIORITY['reconcile-background-responses'],
          ordering: { key: 'ai_background_response_reconcile', concurrency: 1 },
        },
      })
    } finally {
      await (await ai_agents.getJob(jobId))?.remove()
    }
  })
})
