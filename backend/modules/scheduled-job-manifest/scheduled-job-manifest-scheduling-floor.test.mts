import { describe, expect, it, vi } from 'vitest'
import { defineScheduledJobManifest, upsertScheduledJobManifest } from './index.mts'
import type { ScheduledJobDefinition, ScheduledJobQueue } from './types.mts'

function makeQueue(upsertJobScheduler: ScheduledJobQueue['upsertJobScheduler']): ScheduledJobQueue {
  return {
    upsertJobScheduler,
    getRepeatableJobs: async () => [],
    removeJobScheduler: async () => undefined,
  }
}

function job(overrides: Partial<ScheduledJobDefinition> = {}): ScheduledJobDefinition {
  return {
    schedulerId: 'floor-scheduler',
    repeat: { pattern: '* * * * *' },
    template: { name: 'floor-job', data: {}, opts: {} },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'floor-job' }],
    ...overrides,
  }
}

describe('scheduled job repeat: 1-minute scheduling floor', () => {
  it('rejects a sub-minute every without justification', () => {
    expect(() =>
      defineScheduledJobManifest('example', [job({ repeat: { every: 59_999 } })]),
    ).toThrow('is below the 60000ms scheduling floor')
  })

  it('rejects a sub-minute every with a blank justification', () => {
    expect(() =>
      defineScheduledJobManifest('example', [
        job({ repeat: { every: 5_000 }, subMinuteJustification: '   ' }),
      ]),
    ).toThrow('is below the 60000ms scheduling floor')
  })

  it('accepts a sub-minute every when justified', () => {
    const manifest = defineScheduledJobManifest('example', [
      job({ repeat: { every: 5_000 }, subMinuteJustification: 'paged recovery path' }),
    ])
    expect(manifest.jobs[0]!.repeat).toEqual({ every: 5_000 })
  })

  it('accepts exactly the floor without justification', () => {
    const manifest = defineScheduledJobManifest('example', [job({ repeat: { every: 60_000 } })])
    expect(manifest.jobs[0]!.repeat).toEqual({ every: 60_000 })
  })

  it('accepts a 5-field cron pattern', () => {
    const manifest = defineScheduledJobManifest('example', [
      job({ repeat: { pattern: '*/5 * * * *' } }),
    ])
    expect(manifest.jobs[0]!.repeat).toEqual({ pattern: '*/5 * * * *' })
  })

  it('rejects a 6-field cron pattern regardless of the seconds field', () => {
    expect(() =>
      defineScheduledJobManifest('example', [job({ repeat: { pattern: '0 * * * * *' } })]),
    ).toThrow('must be a 5-field cron pattern (got 6 fields)')
    expect(() =>
      defineScheduledJobManifest('example', [job({ repeat: { pattern: '* * * * * *' } })]),
    ).toThrow('must be a 5-field cron pattern (got 6 fields)')
  })

  it('rejects a pattern with fewer than 5 fields', () => {
    expect(() =>
      defineScheduledJobManifest('example', [job({ repeat: { pattern: '* * * *' } })]),
    ).toThrow('must be a 5-field cron pattern (got 4 fields)')
  })

  it('rejects an unjustified sub-minute thunk at registration time', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    const manifest = defineScheduledJobManifest('example', [
      job({ repeat: () => ({ every: 1_000 }) }),
    ])

    await expect(
      upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest),
    ).rejects.toThrow('is below the 60000ms scheduling floor')
    expect(upsertJobScheduler).not.toHaveBeenCalled()
  })

  it('registers a justified sub-minute thunk at registration time', async () => {
    const upsertJobScheduler = vi
      .fn<ScheduledJobQueue['upsertJobScheduler']>()
      .mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [
      job({ repeat: () => ({ every: 1_000 }), subMinuteJustification: 'paged recovery path' }),
    ])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'floor-scheduler',
      { every: 1_000 },
      expect.anything(),
    )
  })

  it('survives both the static definition path and the resolved registration path once justified', async () => {
    const definition = job({
      repeat: { every: 5_000 },
      subMinuteJustification: 'paged recovery path',
    })

    const manifest = defineScheduledJobManifest('example', [definition])

    const upsertJobScheduler = vi
      .fn<ScheduledJobQueue['upsertJobScheduler']>()
      .mockResolvedValue(undefined)
    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'floor-scheduler',
      { every: 5_000 },
      expect.anything(),
    )
  })
})
