import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobDefinition } from './types.mts'
import { defineScheduledJobManifest, upsertScheduledJobManifest } from './index.mts'

type ScheduledJobQueue = Parameters<typeof upsertScheduledJobManifest>[0]

describe('upsertScheduledJobManifest leftover scheduler reconcile', () => {
  it('removes production-only leftovers on staging when NODE_ENV is production', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const getRepeatableJobs = vi.fn<ScheduledJobQueue['getRepeatableJobs']>()
    getRepeatableJobs.mockResolvedValue([
      { name: 'example-scheduler' },
      { name: 'production-scheduler' },
    ])
    const removeJobScheduler = vi.fn<ScheduledJobQueue['removeJobScheduler']>()
    removeJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [
      job(),
      { ...job('production-scheduler'), environment: 'production' },
    ])

    await upsertScheduledJobManifest(
      makeQueue(upsertJobScheduler, { getRepeatableJobs, removeJobScheduler }),
      manifest,
      { env: { ENVIRONMENT: 'staging', NODE_ENV: 'production' } },
    )

    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'example-scheduler',
      expect.anything(),
      expect.anything(),
    )
    expect(removeJobScheduler).toHaveBeenCalledTimes(1)
    expect(removeJobScheduler).toHaveBeenCalledWith('production-scheduler')
  })

  it('keeps production-only schedulers when ENVIRONMENT is production', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const getRepeatableJobs = vi.fn<ScheduledJobQueue['getRepeatableJobs']>()
    getRepeatableJobs.mockResolvedValue([
      { name: 'example-scheduler' },
      { name: 'production-scheduler' },
    ])
    const removeJobScheduler = vi.fn<ScheduledJobQueue['removeJobScheduler']>()
    removeJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [
      job(),
      { ...job('production-scheduler'), environment: 'production' },
    ])

    await upsertScheduledJobManifest(
      makeQueue(upsertJobScheduler, { getRepeatableJobs, removeJobScheduler }),
      manifest,
      { env: { ENVIRONMENT: 'production', NODE_ENV: 'production' } },
    )

    expect(upsertJobScheduler).toHaveBeenCalledTimes(2)
    expect(removeJobScheduler).not.toHaveBeenCalled()
  })
})

function makeQueue(
  upsertJobScheduler: ScheduledJobQueue['upsertJobScheduler'],
  extras: Partial<Pick<ScheduledJobQueue, 'getRepeatableJobs' | 'removeJobScheduler'>> = {},
): ScheduledJobQueue {
  return {
    upsertJobScheduler,
    getRepeatableJobs: extras.getRepeatableJobs ?? (async () => []),
    removeJobScheduler: extras.removeJobScheduler ?? (async () => undefined),
  }
}

function job(schedulerId = 'example-scheduler'): ScheduledJobDefinition {
  const trigger = () => undefined
  return {
    schedulerId,
    repeat: { pattern: '* * * * *' },
    template: { name: 'example-job', data: {}, opts: { attempts: 3 } },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: schedulerId,
        schedule: '* * * * *',
        description: 'Run the example job',
        trigger,
      },
    ],
  }
}
