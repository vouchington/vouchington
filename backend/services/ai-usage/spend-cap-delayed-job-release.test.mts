import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import {
  completeOpenAiSpendCapDelayedJobRelease,
  releaseOpenAiSpendCapDelayedJobs,
} from './spend-cap-delayed-job-release.mts'
import { openAiSpendCapDelayedRegistryKey } from './spend-cap-delayed-jobs.mts'

describe('completeOpenAiSpendCapDelayedJobRelease', () => {
  it.each([
    [1, true],
    [0, false],
  ])('maps lease-fenced completion script result %s to %s', async (scriptResult, expected) => {
    const day = '2026-08-16'
    const invokeScript = vi
      .fn<Pick<typeof workerQueueCommandClient, 'invokeScript'>['invokeScript']>()
      .mockResolvedValue(scriptResult)
    const hlen = vi.fn<Pick<typeof workerQueueCommandClient, 'hlen'>['hlen']>()
    const hscan = vi.fn<Pick<typeof workerQueueCommandClient, 'hscan'>['hscan']>()

    await expect(
      completeOpenAiSpendCapDelayedJobRelease(day, 'generation-a', 'lease-a', {
        invokeScript,
        hlen,
        hscan,
      }),
    ).resolves.toBe(expected)

    expect(invokeScript).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      keys: [openAiSpendCapDelayedRegistryKey(day)],
      args: ['generation-a', 'lease-a'],
    })
  })
})

describe('releaseOpenAiSpendCapDelayedJobs', () => {
  it('passes the classified delay day into the atomic promotion script', async () => {
    const day = '2026-08-16'
    const jobId = 'job-a'
    const job = {
      id: jobId,
      data: { openAiSpendCapDelayedDay: day },
      getState: async () => 'delayed' as const,
    } as Pick<Job<{ openAiSpendCapDelayedDay?: string }>, 'id' | 'data' | 'getState'>
    const invokeScript = vi
      .fn<Pick<typeof workerQueueCommandClient, 'invokeScript'>['invokeScript']>()
      .mockResolvedValue(1)
    const hlen = vi.fn<Pick<typeof workerQueueCommandClient, 'hlen'>['hlen']>().mockResolvedValue(3)
    const hscan = vi
      .fn<Pick<typeof workerQueueCommandClient, 'hscan'>['hscan']>()
      .mockResolvedValue(['0', [`job:${jobId}`, 'marked']])

    await expect(
      releaseOpenAiSpendCapDelayedJobs(
        day,
        'lease-a',
        {
          name: 'ai_agents',
          getJob: async () => job as Job<{ openAiSpendCapDelayedDay?: string }>,
        },
        { invokeScript, hlen, hscan },
      ),
    ).resolves.toEqual({ released: 1, hasPending: false, cursor: '0' })

    expect(invokeScript).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      keys: expect.arrayContaining([openAiSpendCapDelayedRegistryKey(day)]),
      args: ['lease-a', day, `job:${jobId}`, jobId],
    })
  })
})
