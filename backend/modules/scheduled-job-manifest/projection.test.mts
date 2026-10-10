import { describe, expect, it } from 'vitest'
import type { ScheduledJobDefinition, ScheduledJobManifest } from './types.mts'
import { projectScheduledJobs } from './index.mts'

describe('projectScheduledJobs applyHourlyFloor', () => {
  it('leaves every schedule text untouched when applyHourlyFloor is omitted (default off)', () => {
    const manifest = manifestOf([job('every-5m', { every: 300_000 }, '*/5 * * * *')])

    const projected = projectScheduledJobs([manifest])

    expect(projected[0]?.schedule).toBe('*/5 * * * *')
  })

  it('rewrites the schedule text to the top-of-hour text when the repeat is clamped', () => {
    const manifest = manifestOf([job('every-5m', { every: 300_000 }, '*/5 * * * *')])

    const projected = projectScheduledJobs([manifest], undefined, { applyHourlyFloor: true })

    expect(projected[0]?.schedule).toBe('every 1h')
  })

  it.each([
    ['every 1h', { every: 3_600_000 }, 'hourly', 'every 1h'],
    ['every 3h', { every: 3 * 3_600_000 }, 'every 3 hours', 'every 3h'],
    ['an off-minute hourly cron', { pattern: '17 * * * *' }, '17 * * * *', 'every 1h'],
    ['an off-minute daily cron', { pattern: '30 2 * * *' }, '30 2 * * *', '0 2 * * *'],
  ] satisfies [string, ScheduledJobDefinition['repeat'], string, string][])(
    'rewrites the schedule text to the aligned schedule for %s',
    (_label, repeat, schedule, expected) => {
      const manifest = manifestOf([job('aligned', repeat, schedule)])

      const projected = projectScheduledJobs([manifest], undefined, { applyHourlyFloor: true })

      expect(projected[0]?.schedule).toBe(expected)
    },
  )

  it('leaves the schedule text untouched when the repeat is already aligned', () => {
    const manifest = manifestOf([job('daily', { pattern: '0 3 * * *' }, '0 3 * * *')])

    const projected = projectScheduledJobs([manifest], undefined, { applyHourlyFloor: true })

    expect(projected[0]?.schedule).toBe('0 3 * * *')
  })

  it('never rewrites a production-only job even when applyHourlyFloor is true', () => {
    const manifest = manifestOf([
      { ...job('prod-only', { every: 60_000 }, 'every 1m'), environment: 'production' },
    ])

    const projected = projectScheduledJobs([manifest], undefined, { applyHourlyFloor: true })

    expect(projected[0]?.schedule).toBe('every 1m')
  })

  it('never rewrites a thunk repeat, since it cannot be statically clamped here', () => {
    const manifest = manifestOf([
      { ...job('thunk', { every: 60_000 }, 'every 1m'), repeat: () => ({ every: 60_000 }) },
    ])

    const projected = projectScheduledJobs([manifest], undefined, { applyHourlyFloor: true })

    expect(projected[0]?.schedule).toBe('every 1m')
  })
})

function manifestOf(jobs: readonly ScheduledJobDefinition[]): ScheduledJobManifest {
  return { queueName: 'example', jobs }
}

function job(
  schedulerId: string,
  repeat: ScheduledJobDefinition['repeat'],
  schedule: string,
): ScheduledJobDefinition {
  return {
    schedulerId: `${schedulerId}-scheduler`,
    repeat,
    template: { name: `${schedulerId}-job`, data: {}, opts: { attempts: 3 } },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: schedulerId,
        schedule,
        description: `Run ${schedulerId}`,
        trigger: () => undefined,
      },
    ],
  }
}
