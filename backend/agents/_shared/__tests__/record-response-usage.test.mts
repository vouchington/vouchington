import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  countAiUsageRecordsForAgent,
  countAiUsageRecordsForResponseId,
  countBackgroundResponseRegistrations,
} from '@voucha/test-helpers'
import { getBackgroundResponseHooks } from '@modules/openai-utils/create-response'
import { makeDirectOpenAIResult } from '@voucha/test-helpers/agents/model-call-result'
import { runWithBackgroundResponseJob } from '../background-response-job-context.mts'
import { callRecordingModelUsage } from '../call-recording-model-usage.mts'
import { claimRegisteredResponseUsage } from '../record-response-usage-ledger.mts'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'

const usage = { input_tokens: 101, output_tokens: 52 }
const tokens = { inputTokens: 101, outputTokens: 52 }

function params(agentSlug: string) {
  return {
    agentSlug,
    selection: { provider: 'openai', model: 'gpt-6-luna' } as const,
    openaiTransport: 'direct' as const,
  }
}

async function callWithCreatedResponse(agentSlug: string, responseId: string): Promise<void> {
  await callRecordingModelUsage(
    async () => {
      const hooks = getBackgroundResponseHooks()
      if (!hooks) throw new Error('Background registration hook absent')
      await hooks.onResponseCreated(responseId)
      return makeDirectOpenAIResult(responseId, usage)
    },
    params(agentSlug),
    { assertDailySpendCapNotBreached: async () => null },
  )
}

describe('background response ownership and usage', () => {
  it('requires job context to clear a billed job response after its ledger write', async () => {
    const responseId = `resp_${randomUUID()}`
    await expect(
      claimRegisteredResponseUsage({
        registration: { responseId, kind: 'job', createdAt: new Date() },
        agentSlug: `lost-context-${randomUUID()}`,
        provider: 'openai',
        transport: 'direct',
        model: 'gpt-6-luna-2026-10-01',
        serviceTier: 'flex',
        usage: {
          inputTokens: 101,
          outputTokens: 52,
          cacheReadTokens: 0,
          cacheWrite5mTokens: 0,
          cacheWrite1hTokens: 0,
          reasoningOutputTokens: 0,
        },
      }),
    ).rejects.toThrow(`Background response lost its GlideMQ job context: ${responseId}`)
    await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
  })

  it('records and deletes the inline request registration', async () => {
    const responseId = `resp_${randomUUID()}`
    const agentSlug = `inline-${randomUUID()}`
    await callWithCreatedResponse(agentSlug, responseId)
    await expect(countAiUsageRecordsForAgent(agentSlug, tokens)).resolves.toBe(1)
    await expect(countBackgroundResponseRegistrations(responseId)).resolves.toBe(0)
  })

  it('records each job-owned response once and never inserts the inline table', async () => {
    const responseId = `resp_${randomUUID()}`
    const agentSlug = `job-${randomUUID()}`
    const created: string[] = []
    const settled: string[] = []
    const job = {
      register: async (response: { responseId: string }) => {
        created.push(response.responseId)
      },
      settle: async (id: string) => {
        settled.push(id)
      },
    }
    await runWithBackgroundResponseJob(job, () => callWithCreatedResponse(agentSlug, responseId))
    await runWithBackgroundResponseJob(job, () => callWithCreatedResponse(agentSlug, responseId))
    expect(created).toEqual([responseId, responseId])
    expect(settled).toEqual([responseId, responseId])
    await expect(countAiUsageRecordsForAgent(agentSlug, tokens)).resolves.toBe(1)
    await expect(countBackgroundResponseRegistrations(responseId)).resolves.toBe(0)
  })

  it('keeps a successful paid result when clearing its already billed job ID fails', async () => {
    const responseId = `resp_${randomUUID()}`
    const agentSlug = `job-settle-failed-${randomUUID()}`
    const job = {
      register: vi.fn<() => Promise<void>>(async () => undefined),
      settle: vi.fn<() => Promise<void>>(async () => {
        throw new Error('job data update failed')
      }),
    }
    sentryCaptureExceptionMock.mockClear()
    await expect(
      runWithBackgroundResponseJob(job, () => callWithCreatedResponse(agentSlug, responseId)),
    ).resolves.toBeUndefined()
    await expect(countAiUsageRecordsForAgent(agentSlug, tokens)).resolves.toBe(1)
    await expect(countBackgroundResponseRegistrations(responseId)).resolves.toBe(0)
    expect(job.settle).toHaveBeenCalledExactlyOnceWith(responseId)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
  })
})
