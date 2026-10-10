import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectScheduledJobs, upsertScheduledJobManifest } from '@modules/scheduled-job-manifest'
import type { DeployEnvironmentSource } from '@ts-shared/deploy-environment'
import { SCHEDULED_JOB_MANIFESTS } from '@services/queue-monitoring/scheduled-job-manifests'

type ScheduledJobQueue = Parameters<typeof upsertScheduledJobManifest>[0]

describe('staging hourly wake alignment', () => {
  afterEach(() => vi.restoreAllMocks())

  // ECS sets NODE_ENV to production in every deployed environment, including staging. The explicit
  // deployment-environment source exercises the real staging alignment without mutating process.env.
  it('registers every staging scheduler as a cron at minute :00 and leaves aligned crons unchanged', async () => {
    const baseline = await captureRegisteredRepeats({ ENVIRONMENT: 'production' })
    const staging = await captureRegisteredRepeats({ ENVIRONMENT: 'staging' })
    expect(baseline.size).toBe(83)
    expect(staging.size).toBe(83)
    const notAtMinuteZero = [...staging]
      .filter(([, repeat]) => !isCronAtMinuteZero(repeat))
      .map(([key]) => key)
    const movedAlignedCron = [...baseline]
      .filter(
        ([key, declared]) =>
          isCronAtMinuteZero(declared) &&
          JSON.stringify(staging.get(key)) !== JSON.stringify(declared),
      )
      .map(([key]) => key)
    expect(notAtMinuteZero).toEqual([])
    expect(movedAlignedCron).toEqual([])
  })

  it('aligns the off-minute, interval and sub-hourly jobs onto the shared hourly wake', async () => {
    const staging = await captureRegisteredRepeats({ ENVIRONMENT: 'staging' })
    expect(staging.get('heartbeat/publish-glidemq-stats')).toEqual({ pattern: '0 * * * *' })
    expect(staging.get('images/cleanup-abandoned-uploads-schedule')).toEqual({
      pattern: '0 * * * *',
    })
    expect(staging.get('notifications/copyright-evidence-retention')).toEqual({
      pattern: '0 * * * *',
    })
    expect(staging.get('memberships/googlePlayOidcTrustRefresh')).toEqual({
      pattern: '0 */3 * * *',
    })
    expect(staging.get('bloom-filters/backfillEntityCacheBloomFilter_topics')).toEqual({
      pattern: '0 4 * * 0',
    })
  })

  it('leaves the production-only daily cleanup schedule unchanged in staging', async () => {
    const staging = await captureRegisteredRepeats({ ENVIRONMENT: 'staging' })
    expect(staging.get('psql/data-retention-cleanup-daily')).toEqual({ pattern: '0 4 * * *' })
  })

  it('uses the production baseline when no deployment environment is supplied', async () => {
    const repeats = new Map<string, unknown>()
    for (const manifest of SCHEDULED_JOB_MANIFESTS) {
      const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
      upsertJobScheduler.mockResolvedValue(undefined)
      await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)
      for (const [schedulerId, repeat] of upsertJobScheduler.mock.calls.map(
        call => [call[0], call[1]] as const,
      ))
        repeats.set(`${manifest.queueName}/${schedulerId}`, repeat)
    }
    const production = await captureRegisteredRepeats({ ENVIRONMENT: 'production' })
    for (const [key, repeat] of repeats) expect(repeat).toEqual(production.get(key))
  })

  it('keeps projected operator schedules aligned with the registered staging repeats', async () => {
    const jobKeyBySurfaceId = new Map(
      SCHEDULED_JOB_MANIFESTS.flatMap(manifest =>
        manifest.jobs.flatMap(job =>
          job.operatorSurfaces.flatMap(surface =>
            surface.kind === 'scheduled-jobs'
              ? [[surface.id, `${manifest.queueName}/${job.schedulerId}`] as const]
              : [],
          ),
        ),
      ),
    )
    const baselineRepeats = await captureRegisteredRepeats({ ENVIRONMENT: 'production' })
    const stagingRepeats = await captureRegisteredRepeats({ ENVIRONMENT: 'staging' })
    const baseline = projectScheduledJobs(SCHEDULED_JOB_MANIFESTS)
    const staging = projectScheduledJobs(SCHEDULED_JOB_MANIFESTS, undefined, {
      applyHourlyFloor: true,
    })
    const baselineById = new Map(baseline.map(job => [job.id, job.schedule]))
    const mismatches = staging.flatMap(job => {
      const key = jobKeyBySurfaceId.get(job.id)!
      const stagingRepeat = stagingRepeats.get(key) as { pattern: string }
      const realigned = JSON.stringify(stagingRepeat) !== JSON.stringify(baselineRepeats.get(key))
      const expected = realigned
        ? expectedOperatorText(stagingRepeat.pattern)
        : baselineById.get(job.id)
      return job.schedule === expected ? [] : [{ id: job.id, schedule: job.schedule, expected }]
    })
    expect(mismatches).toEqual([])
    expect(staging.find(job => job.id === 'publish-glidemq-stats')?.schedule).toBe('every 1h')
  })
})

async function captureRegisteredRepeats(
  env: DeployEnvironmentSource,
): Promise<Map<string, unknown>> {
  const repeats = new Map<string, unknown>()
  for (const manifest of SCHEDULED_JOB_MANIFESTS) {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      nodeEnv: 'production',
      env,
    })
    for (const [schedulerId, repeat] of upsertJobScheduler.mock.calls.map(
      call => [call[0], call[1]] as const,
    ))
      repeats.set(`${manifest.queueName}/${schedulerId}`, repeat)
  }
  return repeats
}

function makeQueue(upsertJobScheduler: ScheduledJobQueue['upsertJobScheduler']): ScheduledJobQueue {
  return {
    upsertJobScheduler,
    getRepeatableJobs: async () => [],
    removeJobScheduler: async () => undefined,
  }
}

function expectedOperatorText(pattern: string): string {
  if (pattern === '0 * * * *') return 'every 1h'
  const hourStep = /^0 \*\/(\d+) \* \* \*$/.exec(pattern)?.[1]
  return hourStep === undefined ? pattern : `every ${hourStep}h`
}

function isCronAtMinuteZero(repeat: unknown): boolean {
  if (typeof repeat !== 'object' || repeat === null || !('pattern' in repeat)) return false
  return typeof repeat.pattern === 'string' && repeat.pattern.split(/\s+/)[0] === '0'
}
