import { describe, expect, it, vi } from 'vitest'
import type { latchAccountingUncertainty as latchAccountingUncertaintyFn } from '@services/ai-usage'
import { makeDirectOpenAIResult } from '@voucha/test-helpers/agents/model-call-result'
import { callRecordingModelUsage } from '../call-recording-model-usage.mts'
import { recordAgentResponseUsage } from '../record-response-usage.mts'
import type { recordModelUsage } from '../record-model-usage.mts'

function responseWithUsage() {
  return {
    id: 'resp-settlement',
    model: 'gpt-6-luna-2026-10-01',
    service_tier: 'flex' as const,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

describe('recordAgentResponseUsage settlement barrier', () => {
  it('waits for the uncertainty latch after a ledger failure', async () => {
    const ledgerError = new Error('ledger unavailable')
    const latchSettled = Promise.withResolvers<void>()
    const latchCalled = Promise.withResolvers<void>()
    const claimRegisteredResponseUsage = vi.fn<() => Promise<void>>().mockRejectedValue(ledgerError)
    const latchAccountingUncertainty = vi
      .fn<typeof latchAccountingUncertaintyFn>()
      .mockImplementation(async () => {
        latchCalled.resolve()
        await latchSettled.promise
      })
    const recording = recordAgentResponseUsage(
      {
        response: responseWithUsage(),
        agentSlug: 'settlement-test',
        transport: 'direct',
        createdAt: new Date('2026-08-16'),
      },
      { claimRegisteredResponseUsage, latchAccountingUncertainty },
    )
    let settled = false
    void recording.then(() => {
      settled = true
    })

    await latchCalled.promise
    expect(latchAccountingUncertainty).toHaveBeenCalledExactlyOnceWith({
      requestDay: '2026-08-16',
      source: 'ledger_write_failed',
    })
    expect(settled).toBe(false)
    latchSettled.resolve()
    await expect(recording).resolves.toBeUndefined()
  })

  it('fails closed when the ledger and uncertainty latch both reject', async () => {
    const ledgerError = new Error('ledger unavailable')
    const latchError = new Error('latch unavailable')
    const claimRegisteredResponseUsage = vi.fn<() => Promise<void>>().mockRejectedValue(ledgerError)
    const latchAccountingUncertainty = vi
      .fn<typeof latchAccountingUncertaintyFn>()
      .mockRejectedValue(latchError)

    await expect(
      recordAgentResponseUsage(
        { response: responseWithUsage(), agentSlug: 'settlement-test', transport: 'direct' },
        { claimRegisteredResponseUsage, latchAccountingUncertainty },
      ),
    ).rejects.toBe(latchError)
    expect(claimRegisteredResponseUsage).toHaveBeenCalledOnce()
    expect(latchAccountingUncertainty).toHaveBeenCalledOnce()
  })

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
