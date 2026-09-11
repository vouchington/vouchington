import { describe, expect, it, vi } from 'vitest'
import type { latchAccountingUncertainty as latchAccountingUncertaintyFn } from '@services/ai-usage'
import {
  callRecordingAgentResponseUsage,
  recordAgentResponseUsage,
} from '../record-response-usage.mts'
import { getOpenAIResponseAttemptHooks } from '../create-response.mts'

function response() {
  return {
    id: 'resp-attempt-hooks',
    output: [],
    model: 'gpt-5.4-nano',
    service_tier: 'flex' as const,
  }
}

describe('callRecordingAgentResponseUsage attempt hooks', () => {
  it('installs hooks while keeping attempt one on the initial spend-cap guard only', async () => {
    const assertOpenAiSpendCapNotBreached = vi.fn<(agentSlug: string) => Promise<null>>()
    assertOpenAiSpendCapNotBreached.mockResolvedValue(null)
    const recorder = vi.fn<typeof recordAgentResponseUsage>().mockResolvedValue(undefined)
    let hooksInstalled = false

    await expect(
      callRecordingAgentResponseUsage(
        async () => {
          const hooks = getOpenAIResponseAttemptHooks()
          if (!hooks) throw new Error('Expected response attempt hooks')
          hooksInstalled = true
          await hooks.beforeAttempt({ attempt: 1, requestStartedAt: new Date('2026-08-16') })
          return response()
        },
        { agentSlug: 'attempt-hooks-test' },
        { assertOpenAiSpendCapNotBreached, recordAgentResponseUsage: recorder },
      ),
    ).resolves.toEqual(response())

    expect(hooksInstalled).toBe(true)
    expect(assertOpenAiSpendCapNotBreached).toHaveBeenCalledExactlyOnceWith('attempt-hooks-test')
    expect(recorder).toHaveBeenCalledOnce()
  })

  it('rechecks the cap before a free retry continues into the provider', async () => {
    const retryGuardSettled = Promise.withResolvers<void>()
    const assertOpenAiSpendCapNotBreached = vi
      .fn<(agentSlug: string) => Promise<null>>()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async () => {
        await retryGuardSettled.promise
        return null
      })
    const recorder = vi.fn<typeof recordAgentResponseUsage>().mockResolvedValue(undefined)
    let retryContinued = false
    const call = callRecordingAgentResponseUsage(
      async () => {
        const hooks = getOpenAIResponseAttemptHooks()
        if (!hooks) throw new Error('Expected response attempt hooks')
        await hooks.beforeAttempt({ attempt: 2, requestStartedAt: new Date('2026-08-16') })
        retryContinued = true
        return response()
      },
      { agentSlug: 'attempt-hooks-test' },
      { assertOpenAiSpendCapNotBreached, recordAgentResponseUsage: recorder },
    )

    await vi.waitFor(() => expect(assertOpenAiSpendCapNotBreached).toHaveBeenCalledTimes(2))
    expect(retryContinued).toBe(false)
    retryGuardSettled.resolve()
    await expect(call).resolves.toEqual(response())
    expect(retryContinued).toBe(true)
  })

  it('awaits the unknown-billed latch and propagates a latch failure', async () => {
    const latchSettled = Promise.withResolvers<void>()
    const latchAccountingUncertainty = vi
      .fn<typeof latchAccountingUncertaintyFn>()
      .mockImplementation(async () => await latchSettled.promise)
    const providerError = new Error('connection reset after provider accepted the request')
    const call = callRecordingAgentResponseUsage(
      async () => {
        const hooks = getOpenAIResponseAttemptHooks()
        if (!hooks) throw new Error('Expected response attempt hooks')
        await hooks.onUnknownBilledAttempt({
          requestStartedAt: new Date('2026-08-16T12:00:00.000Z'),
          error: providerError,
        })
        throw providerError
      },
      { agentSlug: 'attempt-hooks-test' },
      {
        assertOpenAiSpendCapNotBreached: async () => null,
        latchAccountingUncertainty,
        recordAgentResponseUsage: vi.fn<typeof recordAgentResponseUsage>(),
      },
    )
    const callRejection = call.catch((error: unknown) => error)

    await vi.waitFor(() =>
      expect(latchAccountingUncertainty).toHaveBeenCalledExactlyOnceWith({
        requestDay: '2026-08-16',
        source: 'unknown_billed_attempt',
      }),
    )
    latchSettled.resolve()
    await expect(callRejection).resolves.toBe(providerError)

    const latchError = new Error('latch unavailable')
    await expect(
      callRecordingAgentResponseUsage(
        async () => {
          const hooks = getOpenAIResponseAttemptHooks()
          if (!hooks) throw new Error('Expected response attempt hooks')
          await hooks.onUnknownBilledAttempt({ requestStartedAt: new Date(), error: providerError })
          throw providerError
        },
        { agentSlug: 'attempt-hooks-test' },
        {
          assertOpenAiSpendCapNotBreached: async () => null,
          latchAccountingUncertainty: async () => {
            throw latchError
          },
        },
      ),
    ).rejects.toBe(latchError)
  })
})
