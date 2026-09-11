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
import { OpenAIResponseNotCompletedError } from '../create-response.mts'
import { recordToolLoopUsage, recordToolLoopFailedUsage } from './record-usage.mts'

// These two exports are the tool loop's only path to recordAgentResponseUsage (record-usage.mts's
// own docstring calls it "the same seam direct (non-loop) callers use"), and the tool loop is the
// dominant token consumer on this queue -- up to 5 iterations plus subagents, versus one call for
// a direct (non-loop) agent. If recordToolLoopUsage/recordToolLoopFailedUsage were ever changed to
// call recordAiUsage directly instead of delegating, glide-mq's tokenLimiter (#8836) would silently
// stop seeing the majority of real consumption. This file fails exactly then -- the delegation is
// proven by an actual accumulator total, not by trusting the docstring.
describe('run-tool-loop/record-usage.mts token-accumulator delegation', () => {
  it('recordToolLoopUsage feeds the active job token accumulator', async () => {
    const agentSlug = `record-usage-delegation-test-${randomUUID()}`
    // Backdated off today's UTC day on purpose: this test omits service_tier, so the resulting
    // ledger row is unpriced, and assertOpenAiSpendCapNotBreached fails closed on any unpriced row
    // in today's getDailyAiCostTotalMicrounits window (same failure mode as record.test.mts's
    // "records unknown pricing without treating it as zero-cost priced usage").
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    const requestDay = reservation.day
    let reported = 0

    await runWithJobTokenAccumulator(
      async () => {
        await recordToolLoopUsage({
          agentSlug,
          response: { usage: { input_tokens: 60, output_tokens: 15 }, model: 'gpt-5.4-nano' },
          createdAt: new Date(`${requestDay}T12:00:00.000Z`),
        })
      },
      async totalTokens => {
        reported = totalTokens
      },
    )

    expect(reported).toBe(75)
  })

  it('recordToolLoopUsage does not feed the accumulator when agentSlug is unset (documented no-op)', async () => {
    let reported = 0

    await runWithJobTokenAccumulator(
      async () => {
        await recordToolLoopUsage({
          response: { usage: { input_tokens: 60, output_tokens: 15 }, model: 'gpt-5.4-nano' },
        })
        // A nonzero sentinel added directly proves the scope itself is active, so the total
        // asserted below reflects only this sentinel -- recordToolLoopUsage's 60+15 truly never
        // landed, rather than the accumulator coincidentally being unreachable in this test.
        addAccumulatedTokens(1)
      },
      async totalTokens => {
        reported = totalTokens
      },
    )

    expect(reported).toBe(1)
  })

  it('recordToolLoopFailedUsage feeds the accumulator from a thrown OpenAIResponseNotCompletedError', async () => {
    const agentSlug = `record-usage-delegation-test-${randomUUID()}`
    // Backdated off today's UTC day for the same reason as the test above -- this row is priced,
    // but an unisolated real-today write is still a landmine for any other parallel test that hits
    // assertOpenAiSpendCapNotBreached's shared daily aggregate.
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    const requestDay = reservation.day
    let reported = 0

    await runWithJobTokenAccumulator(
      async () => {
        const error = new OpenAIResponseNotCompletedError('OpenAI response cancelled', {
          id: `resp_${randomUUID()}`,
          status: 'cancelled',
          model: 'gpt-5.4-nano',
          service_tier: 'flex',
          usage: { input_tokens: 200, output_tokens: 40 },
        } as Response)

        await recordToolLoopFailedUsage(error, {
          agentSlug,
          createdAt: new Date(`${requestDay}T12:00:00.000Z`),
        })
      },
      async totalTokens => {
        reported = totalTokens
      },
    )

    expect(reported).toBe(240)
  })

  it('recordToolLoopFailedUsage does not feed the accumulator for any other error type', async () => {
    let reported = 0

    await runWithJobTokenAccumulator(
      async () => {
        await recordToolLoopFailedUsage(new Error('socket closed'), {
          agentSlug: `record-usage-delegation-test-${randomUUID()}`,
        })
        // Same nonzero-sentinel technique as the agentSlug-unset case above.
        addAccumulatedTokens(1)
      },
      async totalTokens => {
        reported = totalTokens
      },
    )

    expect(reported).toBe(1)
  })
})

// #8773 round-14 finding 1: a foreground stream (run-tool-loop-streaming*.mts) never registers a
// background lease, so recordToolLoopUsage/recordToolLoopFailedUsage are the only seam that can
// carry the streaming request's start time down to the ledger row. These prove createdAt actually
// reaches ai_usage_records via that seam, the same way daily-total.test.mts proves it for the
// registered-lease path.
describe('run-tool-loop/record-usage.mts createdAt propagation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    clearDailyAiCostTotalCacheForTesting()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearDailyAiCostTotalCacheForTesting()
  })

  it('recordToolLoopUsage attributes usage to createdAt`s request day, not the day recording runs', async () => {
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    const requestDay = reservation.day
    const insertDay = new Date(Date.parse(`${requestDay}T00:00:00.000Z`) + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const agentSlug = `record-usage-createdat-${randomUUID()}`

    vi.setSystemTime(new Date(`${insertDay}T00:00:05.000Z`))
    await recordToolLoopUsage({
      agentSlug,
      response: {
        id: `resp_${randomUUID()}`,
        model: 'unknown-model',
        service_tier: 'default',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      createdAt: new Date(`${requestDay}T12:00:00.000Z`),
    })

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

  it('recordToolLoopFailedUsage forwards createdAt from a thrown OpenAIResponseNotCompletedError', async () => {
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    const requestDay = reservation.day
    const agentSlug = `record-usage-createdat-failed-${randomUUID()}`

    const error = new OpenAIResponseNotCompletedError('OpenAI response cancelled', {
      id: `resp_${randomUUID()}`,
      status: 'cancelled',
      model: 'unknown-model',
      service_tier: 'default',
      usage: { input_tokens: 20, output_tokens: 8 },
    } as Response)

    await recordToolLoopFailedUsage(error, {
      agentSlug,
      createdAt: new Date(`${requestDay}T12:00:00.000Z`),
    })

    await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 20, outputTokens: 8 }),
    )

    vi.setSystemTime(new Date(`${requestDay}T12:00:00.000Z`))
    await expect(getDailyAiCostTotalMicrounits()).resolves.toMatchObject({
      hasUnpricedRows: true,
      day: requestDay,
    })
  })
})
