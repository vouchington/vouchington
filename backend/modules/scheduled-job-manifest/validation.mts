import {
  validateScheduledJobManifests as validateSharedManifests,
  type ManifestValidationOptions,
} from '@vouchington/worker-runtime/schedule-manifest'
import type { ScheduledJobDefinition, ScheduledJobManifest } from './types.mts'

/**
 * Validates the operator surfaces the app's admin tools consume: each surface kind carries its own
 * required fields, and ids that address one job (scheduled-job id, backfill id, psql job type)
 * must be unique across every manifest passed to one validation.
 */
export function createOperatorSurfaceValidator(): NonNullable<
  ManifestValidationOptions<ScheduledJobDefinition>['validateSurface']
> {
  const scheduledSurfaceIds = new Set<string>()
  const backfillSurfaceIds = new Set<string>()
  const psqlSurfaceTypes = new Set<string>()

  return (surface, schedulerKey) => {
    if (surface.kind === 'backfill') {
      assertNonEmptyString(surface.backfillId, `${schedulerKey} backfill id`)
      assertUniqueOperatorSurface(backfillSurfaceIds, surface.backfillId, 'backfill id')
      return
    }
    if (surface.kind === 'psql') {
      assertNonEmptyString(surface.jobType, `${schedulerKey} psql job type`)
      assertUniqueOperatorSurface(psqlSurfaceTypes, surface.jobType, 'psql job type')
      return
    }
    if (surface.kind === 'valkey-bloom-filter') {
      assertNonEmptyString(surface.rebuildInput, `${schedulerKey} Valkey rebuild input`)
      return
    }
    if (surface.kind === 'scheduled-jobs') {
      assertNonEmptyString(surface.id, `${schedulerKey} scheduled-job operator id`)
      assertNonEmptyString(surface.schedule, `${schedulerKey} operator schedule`)
      assertNonEmptyString(surface.description, `${schedulerKey} operator description`)
      if (scheduledSurfaceIds.has(surface.id)) {
        throw new Error(`Duplicate scheduled-job operator id: ${surface.id}`)
      }
      scheduledSurfaceIds.add(surface.id)
      return
    }
    const kind = (surface as { kind?: unknown }).kind
    throw new Error(`Unknown operator surface kind: ${String(kind)}`)
  }
}

export function validateScheduledJobManifests(manifests: readonly ScheduledJobManifest[]): void {
  validateSharedManifests(manifests, { validateSurface: createOperatorSurfaceValidator() })
}

function assertUniqueOperatorSurface(seen: Set<string>, value: string, field: string): void {
  if (seen.has(value)) throw new Error(`Duplicate scheduled-job operator ${field}: ${value}`)
  seen.add(value)
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
