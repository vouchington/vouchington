import {
  clampScheduledJobRepeatToHourlyFloor,
  HOURLY_FLOOR_SCHEDULE_TEXT,
} from './hourly-clamp.mts'
import type { ProjectedScheduledJob, ScheduledJobManifest } from './types.mts'
import { validateScheduledJobManifests } from './validation.mts'

export function projectScheduledJobs(
  manifests: readonly ScheduledJobManifest[],
  orderedIds?: readonly string[],
  // `applyHourlyFloor` is a projection.mts-local extension, mirroring runtime.mts's own option:
  // tests drive it directly. The real default — staging only, via the deploy-environment
  // accessor (#9683) — is wired at the scheduled-jobs-registry.mts call site once that merges.
  options: { applyHourlyFloor?: boolean } = {},
): ProjectedScheduledJob[] {
  validateScheduledJobManifests(manifests)
  const applyHourlyFloor = options.applyHourlyFloor ?? false
  const projected = manifests.flatMap(manifest =>
    manifest.jobs.flatMap(job =>
      job.operatorSurfaces.flatMap(surface =>
        surface.kind === 'scheduled-jobs'
          ? [
              {
                id: surface.id,
                queue_name: manifest.queueName,
                job_name: job.template.name,
                schedule: clampedSurfaceSchedule(job, surface.schedule, applyHourlyFloor),
                description: surface.description,
                trigger: surface.trigger,
              },
            ]
          : [],
      ),
    ),
  )
  if (orderedIds === undefined) return projected

  const byId = new Map(projected.map(job => [job.id, job]))
  const orderedIdSet = new Set(orderedIds)
  const duplicateIds = orderedIds.filter((id, index) => orderedIds.indexOf(id) !== index)
  const missingIds = [...byId.keys()].filter(id => !orderedIdSet.has(id))
  const unknownIds = orderedIds.filter(id => !byId.has(id))
  if (
    byId.size !== orderedIds.length ||
    orderedIdSet.size !== orderedIds.length ||
    unknownIds.length > 0
  ) {
    throw new Error(
      `Scheduled-job projection order must contain every projected id exactly once: missing=[${missingIds.join(', ')}], unknown=[${unknownIds.join(', ')}], duplicates=[${duplicateIds.join(', ')}]`,
    )
  }
  return orderedIds.map(id => byId.get(id)!)
}

/**
 * Mirrors the runtime clamp so the operator-facing `schedule` text never disagrees with the
 * cadence actually registered. Skips jobs registered as production-only (never clamped even on
 * staging) and thunk repeats (resolved fresh at registration time, not statically clampable here).
 */
function clampedSurfaceSchedule(
  job: ScheduledJobManifest['jobs'][number],
  schedule: string,
  applyHourlyFloor: boolean,
): string {
  if (
    !applyHourlyFloor ||
    job.environment === 'production' ||
    job.stagingHourlyFloor !== undefined ||
    typeof job.repeat === 'function'
  ) {
    return schedule
  }
  return clampScheduledJobRepeatToHourlyFloor(job.repeat).clamped
    ? HOURLY_FLOOR_SCHEDULE_TEXT
    : schedule
}
