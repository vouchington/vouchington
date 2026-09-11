import { clampScheduledJobRepeatToHourlyFloor } from './hourly-clamp.mts'
import type { ScheduledJobManifest } from './types.mts'

export function validateStagingHourlyFloorBypass(
  job: ScheduledJobManifest['jobs'][number],
  repeat: Exclude<ScheduledJobManifest['jobs'][number]['repeat'], () => unknown>,
  schedulerKey: string,
): void {
  const bypass = job.stagingHourlyFloor
  if (bypass === undefined) return
  assertBypassJustification(bypass.bypassJustification, schedulerKey)
  if (!clampScheduledJobRepeatToHourlyFloor(repeat).clamped) {
    throw new Error(
      `${schedulerKey} staging hourly-floor bypass requires a cadence faster than once per hour`,
    )
  }
}

function assertBypassJustification(justification: unknown, schedulerKey: string): void {
  if (typeof justification !== 'string' || justification.trim() === '') {
    throw new Error(
      `${schedulerKey} staging hourly-floor bypass justification must be a nonempty string`,
    )
  }
  if (justification !== justification.trim()) {
    throw new Error(
      `${schedulerKey} staging hourly-floor bypass justification must not have surrounding whitespace`,
    )
  }
}
