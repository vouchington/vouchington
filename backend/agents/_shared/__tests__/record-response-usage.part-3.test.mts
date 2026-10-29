import { describe, expect, it, vi } from 'vitest'
import { makeDirectOpenAIResult } from '@voucha/test-helpers/agents/model-call-result'
import {
  getBackgroundResponseHooks,
  getOpenAIResponseAttemptHooks,
} from '@modules/openai-utils/create-response'
import { callRecordingModelUsage } from '../call-recording-model-usage.mts'
import type { recordModelUsage } from '../record-model-usage.mts'

function result() {
  return makeDirectOpenAIResult('resp-attempt-hooks', { input_tokens: 10, output_tokens: 5 })
}

function params(agentSlug: string, provider: 'openai' | 'anthropic' = 'openai') {
  return {
    agentSlug,
    selection: { provider, model: provider === 'openai' ? 'gpt-6-luna' : 'claude-haiku-5-5' },
    openaiTransport: 'direct' as const,
  }
}

describe('callRecordingModelUsage attempt hooks', () => {
  it('does not install the direct OpenAI background registry for OpenRouter or Anthropic', async () => {
    const recorder = vi.fn<typeof recordModelUsage>().mockResolvedValue(undefined)
    const deps = { assertDailySpendCapNotBreached: async () => null, recordModelUsage: recorder }

    await callRecordingModelUsage(
      async () => {
        expect(getBackgroundResponseHooks()).toBeUndefined()
        return result()
      },
      { ...params('openrouter-foreground-test'), openaiTransport: 'openrouter' },
      deps,
    )
    await callRecordingModelUsage(
      async () => {
        expect(getBackgroundResponseHooks()).toBeUndefined()
        return result()
      },
      params('anthropic-foreground-test', 'anthropic'),
      deps,
    )

    expect(recorder).toHaveBeenCalledTimes(2)
  })

  it('installs hooks while keeping attempt one on the initial spend-cap guard only', async () => {
    const assertDailySpendCapNotBreached = vi.fn<(agentSlug: string) => Promise<null>>()
    assertDailySpendCapNotBreached.mockResolvedValue(null)
    const recorder = vi.fn<typeof recordModelUsage>().mockResolvedValue(undefined)
    const expected = result()
    let hooksInstalled = false

    await expect(
      callRecordingModelUsage(
        async () => {
          const hooks = getOpenAIResponseAttemptHooks()
          if (!hooks) throw new Error('Expected response attempt hooks')
          hooksInstalled = true
          await hooks.beforeAttempt({ attempt: 1, requestStartedAt: new Date('2026-08-16') })
          return expected
        },
        params('attempt-hooks-test'),
        { assertDailySpendCapNotBreached, recordModelUsage: recorder },
      ),
    ).resolves.toBe(expected)

    expect(hooksInstalled).toBe(true)
    expect(assertDailySpendCapNotBreached).toHaveBeenCalledExactlyOnceWith('attempt-hooks-test')
    expect(recorder).toHaveBeenCalledOnce()
  })

  it('rechecks the cap before a free retry continues into the provider', async () => {
    const retryGuardEntered = Promise.withResolvers<void>()
    const retryGuardSettled = Promise.withResolvers<void>()
    const assertDailySpendCapNotBreached = vi
      .fn<(agentSlug: string) => Promise<null>>()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async () => {
        retryGuardEntered.resolve()
        await retryGuardSettled.promise
        return null
      })
    const recorder = vi.fn<typeof recordModelUsage>().mockResolvedValue(undefined)
    const expected = result()
    let retryContinued = false
    const call = callRecordingModelUsage(
      async () => {
        const hooks = getOpenAIResponseAttemptHooks()
        if (!hooks) throw new Error('Expected response attempt hooks')
        await hooks.beforeAttempt({ attempt: 2, requestStartedAt: new Date('2026-08-16') })
        retryContinued = true
        return expected
      },
      params('attempt-hooks-test'),
      { assertDailySpendCapNotBreached, recordModelUsage: recorder },
    )

    await retryGuardEntered.promise
    expect(assertDailySpendCapNotBreached).toHaveBeenCalledTimes(2)
    expect(retryContinued).toBe(false)
    retryGuardSettled.resolve()
    await expect(call).resolves.toBe(expected)
    expect(retryContinued).toBe(true)
  })
})
