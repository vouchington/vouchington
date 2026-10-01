import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Response } from 'openai/resources/responses/responses'
import {
  acquireTestAiUsageDateReservation,
  findAiUsageRecordForAgent,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import {
  clearDailyAiCostTotalCacheForTesting,
  getDailyAiCostTotalMicrounits,
} from '@services/ai-usage'
import { runWithJobTokenAccumulator, addAccumulatedTokens } from '../token-accumulator.mts'
import {
  OpenAIResponseNotCompletedError,
  type OpenAIResponse,
  type createOpenAIResponse,
} from '../create-response.mts'
import { callRecordingToolLoopUsage } from './record-usage.mts'

// callRecordingToolLoopUsage is the tool loop's only path to recordAgentResponseUsage, and the tool
// loop is the dominant token consumer on this queue -- up to 5 iterations, versus one call for a
// direct (non-loop) agent. If it were ever changed to call recordAiUsage directly instead of
// delegating, glide-mq's tokenLimiter (#8836) would silently stop seeing the majority of real
// consumption. This file fails exactly then -- the delegation is proven by an actual accumulator
// total and a ledger row, not by trusting the docstring.
//
// Date is faked onto an isolated reserved day: the usage rows here are unpriced, and
// assertOpenAiSpendCapNotBreached fails closed on any unpriced row in today's
// getDailyAiCostTotalMicrounits window. The spend-cap check itself is stubbed -- it has its own
// coverage (run-tool-loop.spend-cap.test.mts) and is not what these tests are about.
const params = { model: 'gpt-5.4-nano', input: 'hello' }
const noSpendCap = { assertOpenAiSpendCapNotBreached: async () => null }

function completed(usage: { input_tokens: number; output_tokens: number }): OpenAIResponse {
  return {
    id: `resp_${randomUUID()}`,
    status: 'completed',
    output: [],
    output_text: '',
    model: 'unknown-model',
    service_tier: 'default',
    usage,
  }
}

function notCompleted(usage: { input_tokens: number; output_tokens: number }) {
  return new OpenAIResponseNotCompletedError('OpenAI response cancelled', {
    id: `resp_${randomUUID()}`,
    status: 'cancelled',
    model: 'unknown-model',
    service_tier: 'default',
    usage,
  } as Response)
}

async function reserveRequestDay(): Promise<string> {
  const reservation = await acquireTestAiUsageDateReservation()
  onTestFinished(() => reservation.release())
  vi.setSystemTime(new Date(`${reservation.day}T12:00:00.000Z`))
  return reservation.day
}

async function reportedTokens(run: () => Promise<void>): Promise<number> {
  let reported = 0
  await runWithJobTokenAccumulator(run, async totalTokens => {
    reported = totalTokens
  })
  return reported
}

describe('run-tool-loop/record-usage.mts callRecordingToolLoopUsage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    clearDailyAiCostTotalCacheForTesting()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearDailyAiCostTotalCacheForTesting()
  })

  it('feeds the active job token accumulator and writes a ledger row for a completed call', async () => {
    await reserveRequestDay()
    const agentSlug = `record-usage-delegation-test-${randomUUID()}`
    const response = completed({ input_tokens: 60, output_tokens: 15 })
    const createResponse = vi.fn<typeof createOpenAIResponse>().mockResolvedValue(response)

    const reported = await reportedTokens(async () => {
      await expect(
        callRecordingToolLoopUsage(createResponse, params, undefined, { agentSlug }, noSpendCap),
      ).resolves.toBe(response)
    })

    expect(reported).toBe(75)
    await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 60, outputTokens: 15 }),
    )
  })

  it('skips recording entirely when agentSlug is unset (documented no-op)', async () => {
    const response = completed({ input_tokens: 60, output_tokens: 15 })
    const createResponse = vi.fn<typeof createOpenAIResponse>().mockResolvedValue(response)

    const reported = await reportedTokens(async () => {
      await expect(callRecordingToolLoopUsage(createResponse, params, undefined, {})).resolves.toBe(
        response,
      )
      // A nonzero sentinel added directly proves the scope itself is active, so the total asserted
      // below reflects only this sentinel -- the 60+15 truly never landed, rather than the
      // accumulator coincidentally being unreachable in this test.
      addAccumulatedTokens(1)
    })

    expect(reported).toBe(1)
    expect(createResponse).toHaveBeenCalledOnce()
  })

  it('records the usage of a thrown OpenAIResponseNotCompletedError, then rethrows it', async () => {
    await reserveRequestDay()
    const agentSlug = `record-usage-delegation-test-${randomUUID()}`
    const error = notCompleted({ input_tokens: 200, output_tokens: 40 })
    const createResponse = vi.fn<typeof createOpenAIResponse>().mockRejectedValue(error)

    const reported = await reportedTokens(async () => {
      await expect(
        callRecordingToolLoopUsage(createResponse, params, undefined, { agentSlug }, noSpendCap),
      ).rejects.toBe(error)
    })

    expect(reported).toBe(240)
    await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 200, outputTokens: 40 }),
    )
  })

  it('records nothing for any other error type, and rethrows it', async () => {
    const error = new Error('socket closed')
    const createResponse = vi.fn<typeof createOpenAIResponse>().mockRejectedValue(error)

    const reported = await reportedTokens(async () => {
      await expect(
        callRecordingToolLoopUsage(
          createResponse,
          params,
          undefined,
          { agentSlug: `record-usage-delegation-test-${randomUUID()}` },
          noSpendCap,
        ),
      ).rejects.toBe(error)
      // Same nonzero-sentinel technique as the agentSlug-unset case above.
      addAccumulatedTokens(1)
    })

    expect(reported).toBe(1)
  })

  it('attributes usage to the request day when the call finishes after midnight', async () => {
    const requestDay = await reserveRequestDay()
    const insertDay = new Date(Date.parse(`${requestDay}T00:00:00.000Z`) + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const agentSlug = `record-usage-createdat-${randomUUID()}`
    const createResponse = vi.fn<typeof createOpenAIResponse>().mockImplementation(async () => {
      vi.setSystemTime(new Date(`${insertDay}T00:00:05.000Z`))
      return completed({ input_tokens: 10, output_tokens: 5 })
    })

    await callRecordingToolLoopUsage(createResponse, params, undefined, { agentSlug }, noSpendCap)
    await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 10, outputTokens: 5 }),
    )

    vi.setSystemTime(new Date(`${requestDay}T12:00:00.000Z`))
    await expect(getDailyAiCostTotalMicrounits()).resolves.toMatchObject({
      hasUnpricedRows: true,
      day: requestDay,
    })

    vi.setSystemTime(new Date(`${insertDay}T12:00:00.000Z`))
    await expect(getDailyAiCostTotalMicrounits()).resolves.toMatchObject({
      hasUnpricedRows: false,
      day: insertDay,
    })
  })
})
