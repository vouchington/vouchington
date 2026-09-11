import { describe, expect, it, vi } from 'vitest'
import type { latchAccountingUncertainty as latchAccountingUncertaintyFn } from '@services/ai-usage'
import {
  callRecordingAgentResponseUsage,
  recordAgentResponseUsage,
} from '../record-response-usage.mts'

function responseWithUsage() {
  return {
    id: 'resp-settlement',
    model: 'gpt-5.4-nano-2026-03-17',
    service_tier: 'flex' as const,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

describe('recordAgentResponseUsage settlement barrier', () => {
  it('waits for the uncertainty latch after a ledger failure', async () => {
    const ledgerError = new Error('ledger unavailable')
    const latchSettled = Promise.withResolvers<void>()
    const claimRegisteredResponseUsage = vi.fn<() => Promise<void>>().mockRejectedValue(ledgerError)
    const latchAccountingUncertainty = vi
      .fn<typeof latchAccountingUncertaintyFn>()
      .mockImplementation(async () => await latchSettled.promise)
    const recording = recordAgentResponseUsage(
      {
        response: responseWithUsage(),
        agentSlug: 'settlement-test',
        createdAt: new Date('2026-08-16'),
      },
      { claimRegisteredResponseUsage, latchAccountingUncertainty },
    )
    let settled = false
    void recording.then(() => {
      settled = true
    })

    await vi.waitFor(() =>
      expect(latchAccountingUncertainty).toHaveBeenCalledExactlyOnceWith({
        requestDay: '2026-08-16',
        source: 'ledger_write_failed',
      }),
    )
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
        { response: responseWithUsage(), agentSlug: 'settlement-test' },
        { claimRegisteredResponseUsage, latchAccountingUncertainty },
      ),
    ).rejects.toBe(latchError)
    expect(claimRegisteredResponseUsage).toHaveBeenCalledOnce()
    expect(latchAccountingUncertainty).toHaveBeenCalledOnce()
  })

  it('does not resolve the direct OpenAI wrapper before recording settles', async () => {
    const recorderSettled = Promise.withResolvers<void>()
    const recorder = vi
      .fn<typeof recordAgentResponseUsage>()
      .mockImplementation(async () => await recorderSettled.promise)
    const response = responseWithUsage()
    const call = callRecordingAgentResponseUsage(
      async () => response,
      { agentSlug: 'settlement-test' },
      {
        assertOpenAiSpendCapNotBreached: async () => null,
        recordAgentResponseUsage: recorder,
      },
    )
    let resolved = false
    void call.then(() => {
      resolved = true
    })

    await vi.waitFor(() => expect(recorder).toHaveBeenCalledOnce())
    expect(resolved).toBe(false)
    recorderSettled.resolve()
    await expect(call).resolves.toBe(response)
  })
})
