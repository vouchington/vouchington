import { randomUUID } from 'node:crypto'
import { Responses } from 'openai/resources/responses/responses'
import { describe, expect, it, vi } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import {
  backgroundResponseRecoveryJobId,
  BACKGROUND_RESPONSE_RECOVERY_DELAY_MS,
} from '@queues/ai-agents/enqueues/recover-background-response'
import { createBackgroundResponseRegistrationHooks } from '@agents/_shared/record-response-background-hooks'
import { countAiUsageRecordsForResponseId } from '@voucha/test-helpers'
import { makeSdkTextResponse } from '@voucha/test-helpers/modules/openai-utils/responses'
import { processAIAgentWorkerJob } from '../../workers/core.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('inline response delayed recovery', () => {
  it('deduplicates response-created admissions and settles an abandoned inline call without generating', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'inline-recovery-provider-fixture')
    const responseId = `resp_${randomUUID()}`
    const hooks = createBackgroundResponseRegistrationHooks({
      agentSlug: `inline-crash-${randomUUID()}`,
      createdAt: new Date(),
    })
    const retrieve = vi
      .spyOn(Responses.prototype, 'retrieve')
      .mockResolvedValue(
        makeSdkTextResponse('abandoned title', { id: responseId, model: 'gpt-6-luna' }),
      )
    const generate = vi.spyOn(Responses.prototype, 'create')
    try {
      // The request stops immediately after response.created, before normal usage settlement.
      await hooks.hooks.onResponseCreated(responseId)
      await hooks.hooks.onResponseCreated(responseId)
      const job = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
      if (!job) throw new Error('Missing admitted recovery job')
      expect(job.name).toBe('recover-background-response')
      await expect(job.getState()).resolves.toBe('delayed')
      expect(job.opts.delay).toBe(BACKGROUND_RESPONSE_RECOVERY_DELAY_MS)
      expect(job.opts.ordering).toMatchObject({ key: 'ai_background_response_recovery' })
      expect(job.data.backgroundResponses).toHaveLength(1)
      expect(job.data.backgroundResponseProcessorCompleted).toBe(true)
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(0)

      // Execute the actual worker entry point with the persisted native Glide job.
      await processAIAgentWorkerJob(job)
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
      const settled = await ai_agents.getJob(job.id)
      expect(settled?.data.backgroundResponses).toEqual([])
      if (!settled) throw new Error('Missing settled native job')
      await processAIAgentWorkerJob(settled)
      expect(retrieve).toHaveBeenCalledTimes(1)
      expect(generate).not.toHaveBeenCalled()
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
    } finally {
      const job = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
      if (job) await job.remove()
      retrieve.mockRestore()
      generate.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
