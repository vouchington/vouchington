import { describe, expect, it, vi } from 'vitest'
import { findAiUsageRecordForAgent, pollUntilNotNull } from '@voucha/test-helpers'
import { type OwnedBackgroundResponseLease } from '@services/openai-background-responses'
import { type OpenAiSpendCapBreach } from '@services/ai-usage'
import { callRecordingAgentResponseUsage } from '../record-response-usage.mts'
import { getBackgroundResponseHooks } from '../create-response.mts'

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
    const checkSpendCap = vi.fn<(callerName: string) => Promise<OpenAiSpendCapBreach | null>>()
    checkSpendCap.mockResolvedValue(null)

    const response = await callRecordingAgentResponseUsage(
      async () => {
        const lease = await notifyResponseCreated(responseId)
        await lease.stopAndSettle()
        return { id: responseId, model: 'gpt-5.4-nano-2026-03-17', service_tier: 'flex', usage }
      },
      { agentSlug },
      { assertOpenAiSpendCapNotBreached: checkSpendCap },
    )

    expect(checkSpendCap).toHaveBeenCalledExactlyOnceWith(agentSlug)
    expect(response.id).toBe(responseId)
    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 106, outputTokens: 57 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written')
  })

  it('throws OpenAiSpendCapBreachError without invoking fn when the recheck reports a breach', async () => {
    const agentSlug = `record-response-usage-cap-breach-${randomSuffix()}`
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-03-01',
    }
    const checkSpendCap = vi.fn<(callerName: string) => Promise<OpenAiSpendCapBreach | null>>()
    checkSpendCap.mockResolvedValue(breach)
    const fn = vi.fn<() => Promise<never>>(async () => {
      throw new Error('fn must not run once the spend cap recheck reports a breach')
    })

    await expect(
      callRecordingAgentResponseUsage(
        fn,
        { agentSlug },
        { assertOpenAiSpendCapNotBreached: checkSpendCap },
      ),
    ).rejects.toMatchObject({ name: 'OpenAiSpendCapBreachError', breach })
    expect(fn).not.toHaveBeenCalled()
  })
})
