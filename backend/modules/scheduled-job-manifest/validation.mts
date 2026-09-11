import type { ScheduledJobManifest } from './types.mts'
import { validateStagingHourlyFloorBypass } from './staging-hourly-floor-validation.mts'

export function validateScheduledJobManifests(manifests: readonly ScheduledJobManifest[]): void {
  const schedulerKeys = new Set<string>()
  const scheduledSurfaceIds = new Set<string>()
  const backfillSurfaceIds = new Set<string>()
  const psqlSurfaceTypes = new Set<string>()

  for (const manifest of manifests) {
    assertNonEmptyString(manifest.queueName, 'queueName')
    for (const job of manifest.jobs) {
      assertNonEmptyString(job.schedulerId, 'schedulerId')
      assertNonEmptyString(job.template.name, 'job name')
      const template = job.template as { data?: unknown; dataFactory?: unknown }
      if (template.dataFactory !== undefined && typeof template.dataFactory !== 'function') {
        throw new Error(`${manifest.queueName}/${job.schedulerId} dataFactory must be a function`)
      }
      if (template.data !== undefined && template.dataFactory !== undefined) {
        throw new Error(
          `${manifest.queueName}/${job.schedulerId} cannot define data and dataFactory`,
        )
      }
      if (typeof job.repeat !== 'function') {
        validateScheduledJobRepeat(
          job.repeat,
          `${manifest.queueName}/${job.schedulerId}`,
          job.subMinuteJustification,
        )
        validateStagingHourlyFloorBypass(
          job,
          job.repeat,
          `${manifest.queueName}/${job.schedulerId}`,
        )
      }
      if (job.stagingHourlyFloor !== undefined && job.environment === 'production') {
        throw new Error(
          `${manifest.queueName}/${job.schedulerId} cannot bypass the staging hourly floor when environment is production`,
        )
      }
      if (job.operatorSurfaces.length === 0) {
        throw new Error(`${manifest.queueName}/${job.schedulerId} must define an operator surface`)
      }

      const schedulerKey = `${manifest.queueName}/${job.schedulerId}`
      if (schedulerKeys.has(schedulerKey)) {
        throw new Error(`Duplicate scheduled job: ${schedulerKey}`)
      }
      schedulerKeys.add(schedulerKey)

      for (const surface of job.operatorSurfaces) {
        if (surface.kind === 'backfill') {
          assertNonEmptyString(surface.backfillId, `${schedulerKey} backfill id`)
          assertUniqueOperatorSurface(backfillSurfaceIds, surface.backfillId, 'backfill id')
          continue
        }
        if (surface.kind === 'psql') {
          assertNonEmptyString(surface.jobType, `${schedulerKey} psql job type`)
          assertUniqueOperatorSurface(psqlSurfaceTypes, surface.jobType, 'psql job type')
          continue
        }
        if (surface.kind === 'valkey-bloom-filter') {
          assertNonEmptyString(surface.rebuildInput, `${schedulerKey} Valkey rebuild input`)
          continue
        }
        if (surface.kind === 'scheduled-jobs') {
          assertNonEmptyString(surface.id, `${schedulerKey} scheduled-job operator id`)
          assertNonEmptyString(surface.schedule, `${schedulerKey} operator schedule`)
          assertNonEmptyString(surface.description, `${schedulerKey} operator description`)
          if (scheduledSurfaceIds.has(surface.id)) {
            throw new Error(`Duplicate scheduled-job operator id: ${surface.id}`)
          }
          scheduledSurfaceIds.add(surface.id)
          continue
        }
        const kind = (surface as { kind?: unknown }).kind
        throw new Error(`Unknown operator surface kind: ${String(kind)}`)
      }
    }
  }
}

function assertUniqueOperatorSurface(seen: Set<string>, value: string, field: string): void {
  if (seen.has(value)) throw new Error(`Duplicate scheduled-job operator ${field}: ${value}`)
  seen.add(value)
}

/** No scheduled job may repeat faster than this without an explicit `subMinuteJustification`. */
export const SCHEDULING_FLOOR_MS = 60_000

export function validateScheduledJobRepeat(
  repeat: Exclude<ScheduledJobManifest['jobs'][number]['repeat'], () => unknown>,
  schedulerKey: string,
  justification?: string,
): void {
  const hasPattern = 'pattern' in repeat
  const hasEvery = 'every' in repeat
  if (hasPattern === hasEvery) {
    throw new Error(`${schedulerKey} repeat must define exactly one of pattern or every`)
  }
  if (hasPattern) {
    assertNonEmptyString(repeat.pattern, `${schedulerKey} repeat pattern`)
    assertFiveFieldCronPattern(repeat.pattern, schedulerKey)
    return
  }
  if (!Number.isFinite(repeat.every) || repeat.every <= 0) {
    throw new Error(`${schedulerKey} repeat every must be a positive finite number`)
  }
  assertMeetsSchedulingFloor(repeat.every, schedulerKey, justification)
}

// glide-mq's cron evaluator (nextCronOccurrenceUtc/nextCronOccurrenceTz) only ever parses exactly
// 5 whitespace-separated fields and throws on any other count -- there is no seconds-precision
// cron support to guard against, fixed-seconds or otherwise. Rejecting non-5-field patterns here
// fails fast with a scheduler-key-attributed message instead of a generic error deep in glide-mq.
function assertFiveFieldCronPattern(pattern: string, schedulerKey: string): void {
  const fieldCount = pattern.trim().split(/\s+/).length
  if (fieldCount !== 5) {
    throw new Error(
      `${schedulerKey} repeat pattern must be a 5-field cron pattern (got ${fieldCount} fields); ` +
        'seconds-precision cron patterns are not supported',
    )
  }
}

function assertMeetsSchedulingFloor(
  everyMs: number,
  schedulerKey: string,
  justification: string | undefined,
): void {
  if (everyMs >= SCHEDULING_FLOOR_MS) return
  if (justification !== undefined && justification.trim() !== '') return
  throw new Error(
    `${schedulerKey} repeat every ${everyMs}ms is below the ${SCHEDULING_FLOOR_MS}ms scheduling ` +
      'floor; set subMinuteJustification on the job definition to explain why this cadence is required',
  )
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }
  if (value.trim() === '') {
    throw new Error(`${field} must be a nonempty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`${field} must not have surrounding whitespace`)
  }
}
