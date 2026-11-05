import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { describe, expect, it, vi } from 'vitest'
import { DelayedError } from 'glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { getDayBounds } from '@ts-shared/utils/dates'
import {
  cleanUpSpendCapDay,
  disableSpendCapForTest,
  findSpendCapRechecks,
  spendCapDelayableJob,
  uniqueSpendCapDay,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { delayForSpendCap } from '../../processors/spend-cap-delay.mts'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import {
  createAIAgentReportFixture,
  installAIAgentProviderFixtures,
} from '@voucha/test-helpers/ai-agent-worker-fixtures'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

function aiAgentJob() {
  return spendCapDelayableJob('report-judgement', {} as AIAgentJobData)
}

async function recheckDelays(day: string): Promise<unknown[]> {
  return (await findSpendCapRechecks(day)).map(recheck => recheck.opts.delay)
}

describe('AI spend-cap registration timing', () => {
  it('registers the current UTC generation before moving the job to its day end', async () => {
    installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      vi.setSystemTime(new Date(`${day}T23:59:30.000Z`))
      const runtime = await startAIAgentWorkerForTest()
      const outcome = await runtime.run('report-judgement', fixture.data)
      expect(outcome.kind).toBe('delayed')
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      await expect(recheckDelays(day)).resolves.toEqual([30_000])
      await runtime.close()
    })
  })

  it('queues an expired UTC-day generation for immediate recheck', async () => {
    const day = uniqueSpendCapDay()
    cleanUpSpendCapDay(day)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(getDayBounds(day).endMs + 12 * 60 * 60 * 1000)
    const job = aiAgentJob()

    try {
      await expect(delayForSpendCap(job, day)).rejects.toThrow(DelayedError)
    } finally {
      vi.useRealTimers()
    }

    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
    await expect(recheckDelays(day)).resolves.toEqual([0])
  })

  it('parks a month-end day at the first instant of the next month', async () => {
    const day = '2026-08-31'
    cleanUpSpendCapDay(day)
    await disableSpendCapForTest()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${day}T12:00:00.000Z`))
    const job = aiAgentJob()

    try {
      await expect(delayForSpendCap(job, day)).rejects.toThrow(DelayedError)
    } finally {
      vi.useRealTimers()
    }

    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(
      Date.parse('2026-09-01T00:00:00.000Z'),
    )
  })
})
