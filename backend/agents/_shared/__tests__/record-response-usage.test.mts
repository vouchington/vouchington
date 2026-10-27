import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { countAiUsageRecordsForAgent } from '@voucha/test-helpers'
import { ai_agents } from '@queues/ai-agents/queues'
import { backgroundResponseRecoveryJobId } from '@queues/ai-agents/enqueues/recover-background-response'
import { getBackgroundResponseHooks } from '@modules/openai-utils/create-response'
import { makeDirectOpenAIResult } from '@voucha/test-helpers/agents/model-call-result'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { runWithBackgroundResponseJob } from '../background-response-job-context.mts'
import { callRecordingModelUsage } from '../call-recording-model-usage.mts'

const usage = { input_tokens: 101, output_tokens: 52 }
const tokens = { inputTokens: 101, outputTokens: 52 }

async function callWithCreatedResponse(agentSlug: string, responseId: string): Promise<void> {
  await callRecordingModelUsage(
    async () => {
      await getBackgroundResponseHooks()?.onResponseCreated(responseId)
      return makeDirectOpenAIResult(responseId, usage)
    },
    {
      agentSlug,
      selection: { provider: 'openai', model: 'gpt-6-luna' },
      openaiTransport: 'direct',
    },
    { assertDailySpendCapNotBreached: async () => null },
  )
}

function jobContext(overrides: { register?: () => Promise<void>; settle?: () => Promise<void> }) {
  return {
    register: vi.fn<() => Promise<void>>(overrides.register ?? (async () => undefined)),
    settle: vi.fn<() => Promise<void>>(overrides.settle ?? (async () => undefined)),
  }
}

describe('background response ownership and usage', () => {
  it('records inline usage and admits a delayed recovery job for the response', () =>
    withReservedAiUsageDay(1_000_000, async () => {
      const responseId = `resp_${randomUUID()}`
      const agentSlug = `inline-${randomUUID()}`
      try {
        await callWithCreatedResponse(agentSlug, responseId)
        await expect(countAiUsageRecordsForAgent(agentSlug, tokens)).resolves.toBe(1)
        const recovery = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
        expect(recovery?.data.backgroundResponses).toEqual([
          expect.objectContaining({ responseId, agentSlug }),
        ])
      } finally {
        const recovery = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
        if (recovery) await recovery.remove()
      }
    }))

  it('saves a job-owned response id, then clears it once usage is recorded', () =>
    withReservedAiUsageDay(1_000_000, async () => {
      const responseId = `resp_${randomUUID()}`
      const agentSlug = `job-${randomUUID()}`
      const job = jobContext({})
      await runWithBackgroundResponseJob(job, () => callWithCreatedResponse(agentSlug, responseId))
      expect(job.register).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ responseId, agentSlug }),
      )
      expect(job.settle).toHaveBeenCalledExactlyOnceWith(responseId)
      await expect(countAiUsageRecordsForAgent(agentSlug, tokens)).resolves.toBe(1)
    }))

  it('keeps a successful paid result when clearing its saved job id fails', () =>
    withReservedAiUsageDay(1_000_000, async () => {
      const responseId = `resp_${randomUUID()}`
      const agentSlug = `job-settle-failed-${randomUUID()}`
      const job = jobContext({
        settle: async () => {
          throw new Error('job data update failed')
        },
      })
      sentryCaptureExceptionMock.mockClear()
      await runWithBackgroundResponseJob(job, () => callWithCreatedResponse(agentSlug, responseId))
      await expect(countAiUsageRecordsForAgent(agentSlug, tokens)).resolves.toBe(1)
      expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    }))

  it('records an unregistered response when saving its id fails', () =>
    withReservedAiUsageDay(1_000_000, async () => {
      const responseId = `resp_${randomUUID()}`
      const agentSlug = `job-register-failed-${randomUUID()}`
      const job = jobContext({
        register: async () => {
          throw new Error('job data update failed')
        },
      })
      sentryCaptureExceptionMock.mockClear()
      await runWithBackgroundResponseJob(job, () => callWithCreatedResponse(agentSlug, responseId))
      await expect(countAiUsageRecordsForAgent(agentSlug, tokens)).resolves.toBe(1)
      expect(job.settle).not.toHaveBeenCalled()
      expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    }))
})
