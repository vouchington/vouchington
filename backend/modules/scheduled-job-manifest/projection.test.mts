import { describe, expect, it } from 'vitest'
import type { ScheduledJobDefinition, ScheduledJobManifest } from './types.mts'
import { projectScheduledJobs } from './index.mts'

describe('projectScheduledJobs applyHourlyFloor', () => {
  it('leaves every schedule text untouched when applyHourlyFloor is omitted (default off)', () => {
    const manifest = manifestOf([job('every-5m', { every: 300_000 }, '*/5 * * * *')])

    const projected = projectScheduledJobs([manifest])

    expect(projected[0]?.schedule).toBe('*/5 * * * *')
  })

  it('rewrites the schedule text to the hourly-floor text when the repeat is clamped', () => {
    const manifest = manifestOf([job('every-5m', { every: 300_000 }, '*/5 * * * *')])

    const projected = projectScheduledJobs([manifest], undefined, { applyHourlyFloor: true })

    expect(projected[0]?.schedule).toBe('every 1h')
  })

  it('leaves the schedule text untouched when the repeat is already at or slower than the floor', () => {
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
