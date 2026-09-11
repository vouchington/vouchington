import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobDefinition, ScheduledJobQueue } from './types.mts'
import { defineScheduledJobManifest, upsertScheduledJobManifest } from './index.mts'

describe('upsertScheduledJobManifest applyHourlyFloor', () => {
  it('leaves every job untouched when applyHourlyFloor is omitted (default off)', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [
      job('every-5m', { every: 300_000 }),
      job('cron-5m', { pattern: '*/5 * * * *' }),
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)

    expect(upsertJobScheduler.mock.calls.map(([, repeat]) => repeat)).toEqual([
      { every: 300_000 },
      { pattern: '*/5 * * * *' },
    ])
  })

  it('clamps an every-type repeat below the hourly floor when applyHourlyFloor is true', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [job('every-5m', { every: 300_000 })])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      applyHourlyFloor: true,
    })

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'every-5m-scheduler',
      { every: 3_600_000 },
      expect.anything(),
    )
  })

  it('clamps a sub-hourly cron pattern to the top of the hour when applyHourlyFloor is true', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [
      job('cron-5m', { pattern: '*/5 * * * *' }),
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      applyHourlyFloor: true,
    })

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'cron-5m-scheduler',
      { pattern: '0 * * * *' },
      expect.anything(),
    )
  })

  it('leaves an already-hourly-or-slower job byte-identical when applyHourlyFloor is true', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [
      job('hourly', { every: 3_600_000 }),
      job('daily', { pattern: '0 3 * * *' }),
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      applyHourlyFloor: true,
    })

    expect(upsertJobScheduler.mock.calls.map(([, repeat]) => repeat)).toEqual([
      { every: 3_600_000 },
      { pattern: '0 3 * * *' },
    ])
  })

  it('clamps the resolved value of a thunk repeat, not the definition', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [
      { ...job('thunk', { every: 60_000 }), repeat: () => ({ every: 60_000 }) },
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      applyHourlyFloor: true,
    })

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'thunk-scheduler',
      { every: 3_600_000 },
      expect.anything(),
    )
  })

  it('never clamps a production-only job even when applyHourlyFloor is true', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [
      { ...job('prod-only', { pattern: '*/15 * * * *' }), environment: 'production' },
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      applyHourlyFloor: true,
      nodeEnv: 'production',
    })

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'prod-only-scheduler',
      { pattern: '*/15 * * * *' },
      expect.anything(),
    )
  })

  it('defaults applyHourlyFloor to true on staging and false on production, via ENVIRONMENT', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [job('every-5m', { every: 300_000 })])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      env: { ENVIRONMENT: 'staging' },
    })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'every-5m-scheduler',
      { every: 3_600_000 },
      expect.anything(),
    )

    upsertJobScheduler.mockClear()
    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      env: { ENVIRONMENT: 'production' },
    })
    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'every-5m-scheduler',
      { every: 300_000 },
      expect.anything(),
    )
  })
})

function makeQueue(upsertJobScheduler: ScheduledJobQueue['upsertJobScheduler']): ScheduledJobQueue {
  return {
    upsertJobScheduler,
    getRepeatableJobs: async () => [],
    removeJobScheduler: async () => undefined,
  }
}

function job(
  schedulerId: string,
  repeat: ScheduledJobDefinition['repeat'],
): ScheduledJobDefinition {
  return {
    schedulerId: `${schedulerId}-scheduler`,
    repeat,
    template: { name: `${schedulerId}-job`, data: {}, opts: { attempts: 3 } },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: schedulerId,
        schedule: 'placeholder',
        description: `Run ${schedulerId}`,
        trigger: () => undefined,
      },
    ],
  }
}
