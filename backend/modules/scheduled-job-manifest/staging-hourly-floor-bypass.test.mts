import { describe, expect, it, vi } from 'vitest'
import type { ScheduledJobDefinition, ScheduledJobQueue } from './types.mts'
import {
  defineScheduledJobManifest,
  projectScheduledJobs,
  upsertScheduledJobManifest,
} from './index.mts'

describe('scheduled-job staging hourly-floor bypass', () => {
  it('preserves an opted-in sub-hourly cadence in runtime and projection', async () => {
    const definition = job({
      stagingHourlyFloor: { bypassJustification: 'Cleanup must keep pace with bounded ingress.' },
    })
    const manifest = defineScheduledJobManifest('example', [definition])
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)

    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      applyHourlyFloor: true,
    })

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      definition.schedulerId,
      { every: 300_000 },
      expect.anything(),
    )
    expect(
      projectScheduledJobs([manifest], undefined, { applyHourlyFloor: true })[0]?.schedule,
    ).toBe('every 5m')
  })

  it('rejects a blank bypass justification', () => {
    expect(() =>
      defineScheduledJobManifest('example', [
        job({ stagingHourlyFloor: { bypassJustification: '  ' } }),
      ]),
    ).toThrow('staging hourly-floor bypass justification must be a nonempty string')
  })

  it('rejects surrounding whitespace in a bypass justification', () => {
    expect(() =>
      defineScheduledJobManifest('example', [
        job({ stagingHourlyFloor: { bypassJustification: ' cleanup must remain bounded ' } }),
      ]),
    ).toThrow('staging hourly-floor bypass justification must not have surrounding whitespace')
  })

  it('rejects a bypass when the cadence is not faster than hourly', () => {
    expect(() =>
      defineScheduledJobManifest('example', [
        job({
          repeat: { every: 3_600_000 },
          stagingHourlyFloor: { bypassJustification: 'Cleanup must remain bounded.' },
        }),
      ]),
    ).toThrow('staging hourly-floor bypass requires a cadence faster than once per hour')
  })

  it('rejects a staging-floor bypass on a production-only job', () => {
    expect(() =>
      defineScheduledJobManifest('example', [
        job({
          environment: 'production',
          stagingHourlyFloor: { bypassJustification: 'Cleanup must remain bounded.' },
        }),
      ]),
    ).toThrow('cannot bypass the staging hourly floor when environment is production')
  })

  it('keeps every ordinary sub-hourly staging job clamped', () => {
    const manifest = defineScheduledJobManifest('example', [job()])

    expect(
      projectScheduledJobs([manifest], undefined, { applyHourlyFloor: true })[0]?.schedule,
    ).toBe('every 1h')
  })
})

function job(overrides: Partial<ScheduledJobDefinition> = {}): ScheduledJobDefinition {
  return {
    schedulerId: 'cleanup-scheduler',
    repeat: { every: 300_000 },
    template: { name: 'cleanup', data: {}, opts: { attempts: 3 } },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'cleanup',
        schedule: 'every 5m',
        description: 'Cleanup expired deliveries',
        trigger: () => undefined,
      },
    ],
    ...overrides,
  }
}

function makeQueue(upsertJobScheduler: ScheduledJobQueue['upsertJobScheduler']): ScheduledJobQueue {
  return {
    upsertJobScheduler,
    getRepeatableJobs: async () => [],
    removeJobScheduler: async () => undefined,
  }
}
