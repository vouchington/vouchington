import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import type { AIAgentJobData, OpenAiSpendCapRecheckJobData } from '@queues/ai-agents/types'
import {
  enqueueOpenAiSpendCapRecheck,
  openAiSpendCapRecheckDeduplicationId,
  OPENAI_SPEND_CAP_RECHECK_MAX_ATTEMPTS,
  OPENAI_SPEND_CAP_RECHECK_RETRY_DELAY_MS,
} from '@queues/ai-agents/enqueues/spend-cap-recheck'
import { registerOpenAiSpendCapDelayedJob as registerDelayedJob } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import { processAIAgentWorkerJob } from './core.mts'
import {
  getOpenAiSpendCapRecheckAt,
  processOpenAiSpendCapRecheckJob,
  registerOpenAiSpendCapRecheck,
} from '../processors/spend-cap-recheck.mts'

function delayedJob<T>(name: string, data: T): Job<T> {
  return {
    data,
    name,
    id: randomUUID(),
    reportTokens: vi.fn<(count: number) => Promise<void>>(),
    updateData: vi.fn<(nextData: T) => Promise<void>>(),
    moveToDelayed: vi
      .fn<(timestamp: number) => Promise<void>>()
      .mockRejectedValue(new Error('delayed')),
  } as unknown as Job<T>
}

function mockWorker(): Worker {
  return { rateLimit: vi.fn<(ms: number) => Promise<void>>() } as unknown as Worker
}

function clearRecheckDependencies() {
  return {
    waitForOpenAiSpendCapConfig: () => Promise.resolve(),
    getOpenAiSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 1 }),
    getDailyAiCostTotalMicrounits: vi.fn<() => Promise<never>>(),
    beginOpenAiSpendCapDelayedJobRelease: vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValue('lease-a'),
    reopenOpenAiSpendCapDelayedJobRegistration: vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(true),
    releaseOpenAiSpendCapDelayedJobs: vi
      .fn<() => Promise<{ released: number; hasPending: boolean; cursor: string }>>()
      .mockResolvedValue({ released: 1, hasPending: false, cursor: '0' }),
    completeOpenAiSpendCapDelayedJobRelease: vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(true),
  }
}

describe('OpenAI spend-cap coordinated rechecks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('parks a registered breached job at the queried day end', async () => {
    const day = '2026-08-16'
    const job = delayedJob('chat', {} as AIAgentJobData)
    const registerOpenAiSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerOpenAiSpendCapRecheck,
      }),
    ).rejects.toThrow('delayed')

    expect(registerOpenAiSpendCapRecheck).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('keeps a registered breach accepted when its coordinator enqueue rejects', async () => {
    const day = '2026-08-16'
    const job = delayedJob('chat', {} as AIAgentJobData)
    const registerOpenAiSpendCapDelayedJob = vi
      .fn<typeof registerDelayedJob>()
      .mockResolvedValue({ accepted: true, generation: 'generation-a' })
    const enqueueCoordinator = vi
      .fn<typeof enqueueOpenAiSpendCapRecheck>()
      .mockRejectedValue(new Error('coordinator unavailable'))

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerOpenAiSpendCapRecheck: (registeredJob, registeredDay) =>
          registerOpenAiSpendCapRecheck(registeredJob, registeredDay, Date.now(), {
            registerOpenAiSpendCapDelayedJob,
            enqueueOpenAiSpendCapRecheck: enqueueCoordinator,
          }),
      }),
    ).rejects.toThrow('delayed')

    expect(registerOpenAiSpendCapDelayedJob).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(enqueueCoordinator).toHaveBeenCalledExactlyOnceWith(day, 'generation-a', 60_000)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('keeps a registered breach accepted when its coordinator enqueue throws synchronously', async () => {
    const day = '2026-08-16'
    const job = delayedJob('chat', {} as AIAgentJobData)
    const registerOpenAiSpendCapDelayedJob = vi
      .fn<typeof registerDelayedJob>()
      .mockResolvedValue({ accepted: true, generation: 'generation-a' })
    const enqueueCoordinator = vi
      .fn<typeof enqueueOpenAiSpendCapRecheck>()
      .mockImplementation(() => {
        throw new Error('coordinator unavailable')
      })

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerOpenAiSpendCapRecheck: (registeredJob, registeredDay) =>
          registerOpenAiSpendCapRecheck(registeredJob, registeredDay, Date.now(), {
            registerOpenAiSpendCapDelayedJob,
            enqueueOpenAiSpendCapRecheck: enqueueCoordinator,
          }),
      }),
    ).rejects.toThrow('delayed')

    expect(registerOpenAiSpendCapDelayedJob).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(enqueueCoordinator).toHaveBeenCalledExactlyOnceWith(day, 'generation-a', 60_000)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('short-delays a stale admission rejected by a releasing registry', async () => {
    const day = '2026-08-16'
    const job = delayedJob('chat', {} as AIAgentJobData)

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerOpenAiSpendCapRecheck: () => Promise.resolve(false),
      }),
    ).rejects.toThrow('delayed')

    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 1_000)
  })

  it.each([
    ['rejects asynchronously', false],
    ['throws synchronously', true],
  ])('reports when registration %s and still parks the source job at midnight', async (_, sync) => {
    const day = '2026-08-16'
    const job = delayedJob('chat', {} as AIAgentJobData)
    const registrationError = new Error('registration unavailable')
    const reportOpenAiSpendCapRegistrationFailure = vi.fn<(error: Error) => void>()
    const registerOpenAiSpendCapRecheck = sync
      ? () => {
          throw registrationError
        }
      : vi.fn<() => Promise<boolean>>().mockRejectedValue(registrationError)

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerOpenAiSpendCapRecheck,
        reportOpenAiSpendCapRegistrationFailure,
      }),
    ).rejects.toThrow('delayed')

    expect(reportOpenAiSpendCapRegistrationFailure).toHaveBeenCalledExactlyOnceWith(
      registrationError,
    )
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('re-delays only the dedicated coordinator while a breach persists', async () => {
    const day = '2026-08-16'
    const job = delayedJob<OpenAiSpendCapRecheckJobData>('recheck', {
      day,
      generation: 'generation-a',
    })
    const begin = vi.fn<() => Promise<string | undefined>>()
    const reopen = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processOpenAiSpendCapRecheckJob(job, {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        beginOpenAiSpendCapDelayedJobRelease: begin,
        reopenOpenAiSpendCapDelayedJobRegistration: reopen,
      }),
    ).rejects.toThrow('delayed')

    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 60_000)
    expect(reopen).toHaveBeenCalledExactlyOnceWith(day, 'generation-a')
    expect(job.data.generation).toBe('generation-a')
    expect(begin).not.toHaveBeenCalled()
  })

  it('stops when a persisted release lease cannot be acquired', async () => {
    const job = delayedJob<OpenAiSpendCapRecheckJobData>('recheck', {
      day: '2026-08-16',
      generation: 'generation-a',
    })
    const dependencies = clearRecheckDependencies()
    dependencies.beginOpenAiSpendCapDelayedJobRelease.mockResolvedValue(undefined)

    await expect(processOpenAiSpendCapRecheckJob(job, dependencies)).resolves.toBeUndefined()

    expect(dependencies.releaseOpenAiSpendCapDelayedJobs).not.toHaveBeenCalled()
    expect(dependencies.completeOpenAiSpendCapDelayedJobRelease).not.toHaveBeenCalled()
  })

  it('invokes configuration initialization through the production default dependency', async () => {
    const job = delayedJob<OpenAiSpendCapRecheckJobData>('recheck', {
      day: '2026-08-16',
      generation: 'generation-a',
    })

    await expect(
      processOpenAiSpendCapRecheckJob(job, {
        getOpenAiSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 1 }),
        beginOpenAiSpendCapDelayedJobRelease: () => Promise.resolve(undefined),
      }),
    ).resolves.toBeUndefined()

    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  it('keeps draining bounded pages until no registered jobs remain', async () => {
    const job = delayedJob<OpenAiSpendCapRecheckJobData>('recheck', {
      day: '2026-08-16',
      generation: 'generation-a',
    })
    const dependencies = clearRecheckDependencies()
    dependencies.releaseOpenAiSpendCapDelayedJobs.mockResolvedValue({
      released: 100,
      hasPending: true,
      cursor: '42',
    })

    await expect(processOpenAiSpendCapRecheckJob(job, dependencies)).rejects.toThrow('delayed')
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 1_000)
    expect(job.updateData).toHaveBeenCalledExactlyOnceWith({
      day: '2026-08-16',
      generation: 'generation-a',
      cursor: '42',
    })
    expect(dependencies.completeOpenAiSpendCapDelayedJobRelease).not.toHaveBeenCalled()
  })

  it('completes after atomically closing an empty releasing registry', async () => {
    const job = delayedJob<OpenAiSpendCapRecheckJobData>('recheck', {
      day: '2026-08-16',
      generation: 'generation-a',
    })
    const dependencies = clearRecheckDependencies()

    await expect(processOpenAiSpendCapRecheckJob(job, dependencies)).resolves.toBeUndefined()
    expect(dependencies.beginOpenAiSpendCapDelayedJobRelease).toHaveBeenCalledOnce()
    expect(dependencies.completeOpenAiSpendCapDelayedJobRelease).toHaveBeenCalledOnce()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  it('bounds rechecks at the queried UTC day end', () => {
    const day = '2026-08-16'
    const now = Date.parse('2026-08-16T23:59:30.000Z')
    expect(getOpenAiSpendCapRecheckAt(day, now)).toBe(getDayBounds(day).endMs)
    expect(getOpenAiSpendCapRecheckAt('2026-08-15')).toBe(getDayBounds('2026-08-15').endMs)
  })

  it('uses generation-scoped deduplication across the full registry recovery window', () => {
    expect(openAiSpendCapRecheckDeduplicationId('2026-08-16', 'a')).not.toBe(
      openAiSpendCapRecheckDeduplicationId('2026-08-16', 'b'),
    )
    expect(OPENAI_SPEND_CAP_RECHECK_MAX_ATTEMPTS).toBe(2 * 24 * 60)
    expect(OPENAI_SPEND_CAP_RECHECK_RETRY_DELAY_MS).toBe(60_000)
    expect(OPENAI_SPEND_CAP_RECHECK_MAX_ATTEMPTS * OPENAI_SPEND_CAP_RECHECK_RETRY_DELAY_MS).toBe(
      2 * 24 * 60 * 60_000,
    )
  })
})
