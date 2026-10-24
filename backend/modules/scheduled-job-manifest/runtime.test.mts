import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobDefinition } from './types.mts'
import { defineScheduledJobManifest, upsertScheduledJobManifest } from './index.mts'

type ScheduledJobQueue = Parameters<typeof upsertScheduledJobManifest>[0]

describe('upsertScheduledJobManifest', () => {
  it('upserts all-environment jobs and filters production-only jobs', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const queue = makeQueue(upsertJobScheduler)
    const manifest = defineScheduledJobManifest('example', [
      job(),
      { ...job('production-scheduler'), environment: 'production' },
    ])

    await upsertScheduledJobManifest(queue, manifest, { nodeEnv: 'test' })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)

    upsertJobScheduler.mockClear()
    await upsertScheduledJobManifest(queue, manifest, { nodeEnv: 'production' })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2)
  })

  it('filters production-only jobs off staging via ENVIRONMENT when no nodeEnv override is given', async () => {
    // ECS sets NODE_ENV=production on every task, staging included; only ENVIRONMENT
    // distinguishes them, so this must NOT behave like the real 'production' case below.
    // Passed as an explicit env object (not process.env mutation) so this state cannot leak
    // across parallel Vitest files.
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const queue = makeQueue(upsertJobScheduler)
    const manifest = defineScheduledJobManifest('example', [
      job(),
      { ...job('production-scheduler'), environment: 'production' },
    ])

    await upsertScheduledJobManifest(queue, manifest, {
      env: { ENVIRONMENT: 'staging', NODE_ENV: 'production' },
    })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)

    upsertJobScheduler.mockClear()
    await upsertScheduledJobManifest(queue, manifest, {
      env: { ENVIRONMENT: 'production', NODE_ENV: 'production' },
    })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2)
  })

  it('registers deployed jobs in staging and production but not local development', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const queue = makeQueue(upsertJobScheduler)
    const manifest = defineScheduledJobManifest('example', [
      { ...job('deployed-scheduler'), environment: 'deployed' },
    ])

    await upsertScheduledJobManifest(queue, manifest, { env: { ENVIRONMENT: 'development' } })
    expect(upsertJobScheduler).not.toHaveBeenCalled()
    await upsertScheduledJobManifest(queue, manifest, { env: { ENVIRONMENT: 'staging' } })
    await upsertScheduledJobManifest(queue, manifest, { env: { ENVIRONMENT: 'production' } })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2)
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
