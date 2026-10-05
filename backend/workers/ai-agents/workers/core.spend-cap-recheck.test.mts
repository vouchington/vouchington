import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import type { AIAgentJobData, SpendCapRecheckJobData } from '@queues/ai-agents/types'
import {
  enqueueSpendCapRecheck,
  spendCapRecheckDeduplicationId,
  SPEND_CAP_RECHECK_MAX_ATTEMPTS,
  SPEND_CAP_RECHECK_RETRY_DELAY_MS,
} from '@queues/ai-agents/enqueues/spend-cap-recheck'
import { registerSpendCapDelayedJob as registerDelayedJob } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import { processAIAgentWorkerJob } from './core.mts'
import {
  processSpendCapRecheckJob,
  registerSpendCapRecheck,
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
    waitForSpendCapConfig: () => Promise.resolve(),
    getSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 1 }),
    getDailyAiCostTotalMicrounits: vi.fn<() => Promise<never>>(),
    beginSpendCapDelayedJobRelease: vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValue('lease-a'),
    reopenSpendCapDelayedJobRegistration: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    releaseSpendCapDelayedJobs: vi
      .fn<() => Promise<{ released: number; hasPending: boolean; cursor: string }>>()
      .mockResolvedValue({ released: 1, hasPending: false, cursor: '0' }),
    completeSpendCapDelayedJobRelease: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  }
}

describe('AI spend-cap coordinated rechecks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('parks a registered breached job at the queried day end', async () => {
    const day = '2026-08-16'
    const job = delayedJob('report-judgement', {} as AIAgentJobData)
    const registerSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForSpendCapConfig: () => Promise.resolve(),
        getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerSpendCapRecheck,
      }),
    ).rejects.toThrow('delayed')

    expect(registerSpendCapRecheck).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('keeps a registered breach accepted when its coordinator enqueue rejects', async () => {
    const day = '2026-08-16'
    const job = delayedJob('report-judgement', {} as AIAgentJobData)
    const registerSpendCapDelayedJob = vi
      .fn<typeof registerDelayedJob>()
      .mockResolvedValue({ accepted: true, generation: 'generation-a' })
    const enqueueCoordinator = vi
      .fn<typeof enqueueSpendCapRecheck>()
      .mockRejectedValue(new Error('coordinator unavailable'))

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForSpendCapConfig: () => Promise.resolve(),
        getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerSpendCapRecheck: (registeredJob, registeredDay) =>
          registerSpendCapRecheck(registeredJob, registeredDay, Date.now(), {
            registerSpendCapDelayedJob,
            enqueueSpendCapRecheck: enqueueCoordinator,
          }),
      }),
    ).rejects.toThrow('delayed')

    expect(registerSpendCapDelayedJob).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(enqueueCoordinator).toHaveBeenCalledExactlyOnceWith(day, 'generation-a', 60_000)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('keeps a registered breach accepted when its coordinator enqueue throws synchronously', async () => {
    const day = '2026-08-16'
    const job = delayedJob('report-judgement', {} as AIAgentJobData)
    const registerSpendCapDelayedJob = vi
      .fn<typeof registerDelayedJob>()
      .mockResolvedValue({ accepted: true, generation: 'generation-a' })
    const enqueueCoordinator = vi.fn<typeof enqueueSpendCapRecheck>().mockImplementation(() => {
      throw new Error('coordinator unavailable')
    })

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForSpendCapConfig: () => Promise.resolve(),
        getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerSpendCapRecheck: (registeredJob, registeredDay) =>
          registerSpendCapRecheck(registeredJob, registeredDay, Date.now(), {
            registerSpendCapDelayedJob,
            enqueueSpendCapRecheck: enqueueCoordinator,
          }),
      }),
    ).rejects.toThrow('delayed')

    expect(registerSpendCapDelayedJob).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(enqueueCoordinator).toHaveBeenCalledExactlyOnceWith(day, 'generation-a', 60_000)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('short-delays a stale admission rejected by a releasing registry', async () => {
    const day = '2026-08-16'
    const job = delayedJob('report-judgement', {} as AIAgentJobData)

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForSpendCapConfig: () => Promise.resolve(),
        getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerSpendCapRecheck: () => Promise.resolve(false),
      }),
    ).rejects.toThrow('delayed')

    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 1_000)
  })

  it.each([
    ['rejects asynchronously', false],
    ['throws synchronously', true],
  ])('reports when registration %s and still parks the source job at midnight', async (_, sync) => {
    const day = '2026-08-16'
    const job = delayedJob('report-judgement', {} as AIAgentJobData)
    const registrationError = new Error('registration unavailable')
    const reportSpendCapRegistrationFailure = vi.fn<(error: Error) => void>()
    const registerSpendCapRecheck = sync
      ? () => {
          throw registrationError
        }
      : vi.fn<() => Promise<boolean>>().mockRejectedValue(registrationError)

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForSpendCapConfig: () => Promise.resolve(),
        getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerSpendCapRecheck,
        reportSpendCapRegistrationFailure,
      }),
    ).rejects.toThrow('delayed')

    expect(reportSpendCapRegistrationFailure).toHaveBeenCalledExactlyOnceWith(registrationError)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('re-delays only the dedicated coordinator while a breach persists', async () => {
    const day = '2026-08-16'
    const job = delayedJob<SpendCapRecheckJobData>('recheck', {
      day,
      generation: 'generation-a',
    })
    const begin = vi.fn<() => Promise<string | undefined>>()
    const reopen = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processSpendCapRecheckJob(job, {
        waitForSpendCapConfig: () => Promise.resolve(),
        getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        beginSpendCapDelayedJobRelease: begin,
        reopenSpendCapDelayedJobRegistration: reopen,
      }),
    ).rejects.toThrow('delayed')

    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 60_000)
    expect(reopen).toHaveBeenCalledExactlyOnceWith(day, 'generation-a')
    expect(job.data.generation).toBe('generation-a')
    expect(begin).not.toHaveBeenCalled()
  })

  it('stops when a persisted release lease cannot be acquired', async () => {
    const job = delayedJob<SpendCapRecheckJobData>('recheck', {
      day: '2026-08-16',
      generation: 'generation-a',
    })
    const dependencies = clearRecheckDependencies()
    dependencies.beginSpendCapDelayedJobRelease.mockResolvedValue(undefined)

    await expect(processSpendCapRecheckJob(job, dependencies)).resolves.toBeUndefined()

    expect(dependencies.releaseSpendCapDelayedJobs).not.toHaveBeenCalled()
    expect(dependencies.completeSpendCapDelayedJobRelease).not.toHaveBeenCalled()
  })

  it('invokes configuration initialization through the production default dependency', async () => {
    const job = delayedJob<SpendCapRecheckJobData>('recheck', {
      day: '2026-08-16',
      generation: 'generation-a',
    })

    await expect(
      processSpendCapRecheckJob(job, {
        getSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 1 }),
        beginSpendCapDelayedJobRelease: () => Promise.resolve(undefined),
      }),
    ).resolves.toBeUndefined()

    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  it('keeps draining bounded pages until no registered jobs remain', async () => {
    const job = delayedJob<SpendCapRecheckJobData>('recheck', {
      day: '2026-08-16',
      generation: 'generation-a',
    })
    const dependencies = clearRecheckDependencies()
    dependencies.releaseSpendCapDelayedJobs.mockResolvedValue({
      released: 100,
      hasPending: true,
      cursor: '42',
    })

    await expect(processSpendCapRecheckJob(job, dependencies)).rejects.toThrow('delayed')
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 1_000)
    expect(job.updateData).toHaveBeenCalledExactlyOnceWith({
      day: '2026-08-16',
      generation: 'generation-a',
      cursor: '42',
    })
    expect(dependencies.completeSpendCapDelayedJobRelease).not.toHaveBeenCalled()
  })

  it('completes after atomically closing an empty releasing registry', async () => {
    const job = delayedJob<SpendCapRecheckJobData>('recheck', {
      day: '2026-08-16',
      generation: 'generation-a',
    })
    const dependencies = clearRecheckDependencies()

    await expect(processSpendCapRecheckJob(job, dependencies)).resolves.toBeUndefined()
    expect(dependencies.beginSpendCapDelayedJobRelease).toHaveBeenCalledOnce()
    expect(dependencies.completeSpendCapDelayedJobRelease).toHaveBeenCalledOnce()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  it('uses generation-scoped deduplication across the full registry recovery window', () => {
    expect(spendCapRecheckDeduplicationId('2026-08-16', 'a')).not.toBe(
      spendCapRecheckDeduplicationId('2026-08-16', 'b'),
    )
    expect(SPEND_CAP_RECHECK_MAX_ATTEMPTS).toBe(2 * 24 * 60)
    expect(SPEND_CAP_RECHECK_RETRY_DELAY_MS).toBe(60_000)
    expect(SPEND_CAP_RECHECK_MAX_ATTEMPTS * SPEND_CAP_RECHECK_RETRY_DELAY_MS).toBe(
      2 * 24 * 60 * 60_000,
    )
  })
})
