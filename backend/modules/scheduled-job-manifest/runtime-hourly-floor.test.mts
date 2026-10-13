import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobDefinition } from './types.mts'
import { defineScheduledJobManifest, upsertScheduledJobManifest } from './index.mts'

type ScheduledJobQueue = Parameters<typeof upsertScheduledJobManifest>[0]

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

  it.each([
    ['sub-hourly every', { every: 300_000 }, { pattern: '0 * * * *' }],
    ['hourly every', { every: 3_600_000 }, { pattern: '0 * * * *' }],
    ['multi-hour every', { every: 3 * 3_600_000 }, { pattern: '0 */3 * * *' }],
    [
      'multi-hour every that does not divide 24h',
      { every: 5 * 3_600_000 },
      { pattern: '0 */6 * * *' },
    ],
    ['sub-hourly cron', { pattern: '*/5 * * * *' }, { pattern: '0 * * * *' }],
    ['off-minute hourly cron', { pattern: '17 * * * *' }, { pattern: '0 * * * *' }],
    ['off-minute daily cron', { pattern: '30 2 * * *' }, { pattern: '0 2 * * *' }],
    ['aligned hourly cron', { pattern: '0 * * * *' }, { pattern: '0 * * * *' }],
    ['aligned daily cron', { pattern: '0 3 * * *' }, { pattern: '0 3 * * *' }],
    ['aligned weekly cron', { pattern: '0 9 * * 1' }, { pattern: '0 9 * * 1' }],
  ] satisfies [string, ScheduledJobDefinition['repeat'], ScheduledJobDefinition['repeat']][])(
    'registers a %s at minute :00 when applyHourlyFloor is true',
    async (_label, repeat, expected) => {
      const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
      upsertJobScheduler.mockResolvedValue(undefined)
      const manifest = defineScheduledJobManifest('example', [job('aligned', repeat)])

      await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
        applyHourlyFloor: true,
      })

      expect(upsertJobScheduler).toHaveBeenCalledWith(
        'aligned-scheduler',
        expected,
        expect.anything(),
      )
    },
  )

  it('leaves an already-aligned cron the exact repeat object the manifest declared', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const repeat = { pattern: '0 3 * * *' }
    const manifest = defineScheduledJobManifest('example', [job('daily', repeat)])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      applyHourlyFloor: true,
    })

    expect(upsertJobScheduler.mock.calls[0]?.[1]).toBe(repeat)
  })

  it('aligns the resolved value of a thunk repeat, not the definition', async () => {
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
      { pattern: '0 * * * *' },
      expect.anything(),
    )
  })

  it('never aligns a production-only job even when applyHourlyFloor is true', async () => {
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

  it('defaults applyHourlyFloor to true on staging, via ENVIRONMENT', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const manifest = defineScheduledJobManifest('example', [job('every-5m', { every: 300_000 })])

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      env: { ENVIRONMENT: 'staging' },
    })

    expect(upsertJobScheduler).toHaveBeenCalledTimes(1)
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'every-5m-scheduler',
      { pattern: '0 * * * *' },
      expect.anything(),
    )
  })

  it('registers every repeat shape exactly as declared on production, via ENVIRONMENT', async () => {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    const repeats: ScheduledJobDefinition['repeat'][] = [
      { every: 300_000 },
      { every: 3_600_000 },
      { every: 3 * 3_600_000 },
      { pattern: '*/5 * * * *' },
      { pattern: '17 * * * *' },
      { pattern: '30 2 * * *' },
    ]
    const manifest = defineScheduledJobManifest(
      'example',
      repeats.map((repeat, index) => job(`job-${index}`, repeat)),
    )

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      env: { ENVIRONMENT: 'production' },
    })

    expect(upsertJobScheduler.mock.calls.map(([, repeat]) => repeat)).toEqual(repeats)
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
