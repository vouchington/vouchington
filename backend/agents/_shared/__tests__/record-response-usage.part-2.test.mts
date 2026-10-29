import { describe, expect, it, vi } from 'vitest'
import { makeDirectOpenAIResult } from '@voucha/test-helpers/agents/model-call-result'
import { callRecordingModelUsage } from '../call-recording-model-usage.mts'
import type { recordModelUsage } from '../record-model-usage.mts'

describe('recordAgentResponseUsage settlement barrier', () => {
  it('does not resolve the direct OpenAI wrapper before recording settles', async () => {
    const recorderStarted = Promise.withResolvers<void>()
    const recorderSettled = Promise.withResolvers<void>()
    const recorder = vi.fn<typeof recordModelUsage>().mockImplementation(async () => {
      recorderStarted.resolve()
      await recorderSettled.promise
    })
    const result = makeDirectOpenAIResult('resp-settlement', {
      input_tokens: 100,
      output_tokens: 50,
    })
    const call = callRecordingModelUsage(
      async () => result,
      {
        agentSlug: 'settlement-test',
        selection: { provider: 'openai', model: 'gpt-6-luna' },
        openaiTransport: 'direct',
      },
      { assertDailySpendCapNotBreached: async () => null, recordModelUsage: recorder },
    )
    let resolved = false
    void call.then(() => {
      resolved = true
    })

    await recorderStarted.promise
    expect(recorder).toHaveBeenCalledOnce()
    expect(resolved).toBe(false)
    recorderSettled.resolve()
    await expect(call).resolves.toBe(result)
  })
})
