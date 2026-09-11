import { randomUUID } from 'node:crypto'
import { Queue } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobDefinition, ScheduledJobQueue } from './types.mts'
import { defineScheduledJobManifest, upsertScheduledJobManifest } from './index.mts'

describe('upsertScheduledJobManifest leftover scheduler reconcile', () => {
  it('removes leftover schedulers after a successful upsert', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const getRepeatableJobs = vi.fn<ScheduledJobQueue['getRepeatableJobs']>()
    getRepeatableJobs.mockResolvedValue([
      { name: 'example-scheduler' },
      { name: 'snapshot-pg-stat-statements' },
    ])
    const removeJobScheduler = vi.fn<ScheduledJobQueue['removeJobScheduler']>()
    removeJobScheduler.mockResolvedValue(undefined)

    await upsertScheduledJobManifest(
      makeQueue(upsertJobScheduler, { getRepeatableJobs, removeJobScheduler }),
      defineScheduledJobManifest('example', [job()]),
    )

    expect(removeJobScheduler).toHaveBeenCalledTimes(1)
    expect(removeJobScheduler).toHaveBeenCalledWith('snapshot-pg-stat-statements')
  })

  it('does not remove scheduler ids that are still in the filtered manifest', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const getRepeatableJobs = vi.fn<ScheduledJobQueue['getRepeatableJobs']>()
    getRepeatableJobs.mockResolvedValue([{ name: 'example-scheduler' }])
    const removeJobScheduler = vi.fn<ScheduledJobQueue['removeJobScheduler']>()
    removeJobScheduler.mockResolvedValue(undefined)

    await upsertScheduledJobManifest(
      makeQueue(upsertJobScheduler, { getRepeatableJobs, removeJobScheduler }),
      defineScheduledJobManifest('example', [job()]),
    )

    expect(removeJobScheduler).not.toHaveBeenCalled()
  })

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

  it('removes leftovers on the vitest Queue used by upsertSchedules', async () => {
    const queue = new Queue(`leftover-reconcile-${randomUUID()}`, {})
    await queue.upsertJobScheduler(
      'snapshot-pg-stat-statements',
      { every: 60_000 },
      { name: 'snapshotPgStatStatements' },
    )

    await upsertScheduledJobManifest(queue, defineScheduledJobManifest(queue.name, [job()]))

    const names = (await queue.getRepeatableJobs()).map(entry => entry.name)
    expect(names).toContain('example-scheduler')
    expect(names).not.toContain('snapshot-pg-stat-statements')
  })

  it('removes every leftover scheduler when the tombstone manifest has no remaining jobs', async () => {
    const queue = new Queue(`leftover-empty-${randomUUID()}`, {})
    await queue.upsertJobScheduler(
      'snapshot-pg-stat-statements',
      { every: 60_000 },
      { name: 'snapshotPgStatStatements' },
    )

    await upsertScheduledJobManifest(queue, defineScheduledJobManifest(queue.name, []))

    expect((await queue.getRepeatableJobs()).map(entry => entry.name)).toEqual([])
  })

  it('does not remove leftovers when an upsert fails', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockRejectedValue(new Error('upsert failed'))
    const getRepeatableJobs = vi.fn<ScheduledJobQueue['getRepeatableJobs']>()
    getRepeatableJobs.mockResolvedValue([{ name: 'snapshot-pg-stat-statements' }])
    const removeJobScheduler = vi.fn<ScheduledJobQueue['removeJobScheduler']>()
    removeJobScheduler.mockResolvedValue(undefined)

    await expect(
      upsertScheduledJobManifest(
        makeQueue(upsertJobScheduler, { getRepeatableJobs, removeJobScheduler }),
        defineScheduledJobManifest('example', [job()]),
      ),
    ).rejects.toThrow('upsert failed')
    expect(getRepeatableJobs).not.toHaveBeenCalled()
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
