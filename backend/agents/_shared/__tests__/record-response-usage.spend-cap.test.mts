import { describe, expect, it, vi } from 'vitest'
import { findAiUsageRecordForAgent } from '@voucha/test-helpers'
import type { OwnedBackgroundResponseLease } from '@services/openai-background-responses'
import type { SpendCapBreach } from '@services/ai-usage'
import { callRecordingAgentResponseUsage } from '../record-response-usage.mts'
import { getBackgroundResponseHooks } from '@modules/openai-utils/create-response'

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

async function notifyResponseCreated(responseId: string): Promise<OwnedBackgroundResponseLease> {
  const lease = await getBackgroundResponseHooks()?.onResponseCreated(responseId)
  if (!lease || !('leaseToken' in lease)) throw new Error('background response lease unavailable')
  return lease as OwnedBackgroundResponseLease
}

describe('callRecordingAgentResponseUsage spend-cap recheck', () => {
  it('rechecks the daily spend cap with agentSlug before invoking fn', async () => {
    const agentSlug = `record-response-usage-cap-check-${randomSuffix()}`
    const responseId = `resp_${randomSuffix()}`
    const usage = { input_tokens: 106, output_tokens: 57 }
    const checkSpendCap = vi.fn<(callerName: string) => Promise<SpendCapBreach | null>>()
    checkSpendCap.mockResolvedValue(null)

    const response = await callRecordingAgentResponseUsage(
      async () => {
        const lease = await notifyResponseCreated(responseId)
        await lease.stopAndSettle()
        return { id: responseId, model: 'gpt-5.4-nano-2026-03-17', service_tier: 'flex', usage }
      },
      { agentSlug },
      { assertDailySpendCapNotBreached: checkSpendCap },
    )

    expect(checkSpendCap).toHaveBeenCalledExactlyOnceWith(agentSlug)
    expect(response.id).toBe(responseId)
    await expect(
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 106, outputTokens: 57 }),
    ).resolves.not.toBeNull()
  })

  it('throws SpendCapBreachError without invoking fn when the recheck reports a breach', async () => {
    const agentSlug = `record-response-usage-cap-breach-${randomSuffix()}`
    const breach: SpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-03-01',
    }
    const checkSpendCap = vi.fn<(callerName: string) => Promise<SpendCapBreach | null>>()
    checkSpendCap.mockResolvedValue(breach)
    const fn = vi.fn<() => Promise<never>>(async () => {
      throw new Error('fn must not run once the spend cap recheck reports a breach')
    })

    await expect(
      callRecordingAgentResponseUsage(
        fn,
        { agentSlug },
        { assertDailySpendCapNotBreached: checkSpendCap },
      ),
    ).rejects.toMatchObject({ name: 'SpendCapBreachError', breach })
    expect(fn).not.toHaveBeenCalled()
  })
})
