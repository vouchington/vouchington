import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type { OpenAiSpendCapRecheckJobData } from '@queues/ai-agents/types'
import { getDayBounds } from '@ts-shared/utils/dates'
import { processOpenAiSpendCapRecheckJob } from './spend-cap-recheck.mts'

describe('OpenAI spend-cap recheck rollover', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
  afterEach(() => vi.useRealTimers())

  it('uses the completion-time UTC boundary when beginning a release drain', async () => {
    const day = '2026-08-16'
    const { endMs } = getDayBounds(day)
    vi.setSystemTime(new Date(endMs - 1))
    const job = {
      data: { day, generation: 'generation-a' },
      moveToDelayed: vi.fn<(timestamp: number) => Promise<void>>(),
      updateData: vi.fn<(data: OpenAiSpendCapRecheckJobData) => Promise<void>>(),
    } as unknown as Job<OpenAiSpendCapRecheckJobData>
    const releaseOpenAiSpendCapDelayedJobs = vi
      .fn<
        (
          day: string,
          lease: string,
          cursor: string,
          dayHasEnded: boolean,
        ) => Promise<{ released: number; hasPending: boolean; cursor: string }>
      >()
      .mockResolvedValue({ released: 0, hasPending: false, cursor: '0' })

    await expect(
      processOpenAiSpendCapRecheckJob(job, {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: async () => {
          vi.setSystemTime(new Date(endMs + 1))
          return { totalMicrounits: 0, hasUnpricedRows: false, day }
        },
        beginOpenAiSpendCapDelayedJobRelease: () => Promise.resolve('lease-a'),
        releaseOpenAiSpendCapDelayedJobs,
        completeOpenAiSpendCapDelayedJobRelease: () => Promise.resolve(true),
      }),
    ).resolves.toBeUndefined()

    expect(releaseOpenAiSpendCapDelayedJobs).toHaveBeenCalledExactlyOnceWith(
      day,
      'lease-a',
      '0',
      true,
    )
  })
})
