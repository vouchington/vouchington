import { releaseModerationTransparencyRange } from './release-moderation-transparency-days.mts'
import { getCompleteDailyCohortCutoff } from './sanitize-moderation-transparency.mts'

/** Releases every closed day of a reserved test window with the scheduled job's statement. */
export function releaseTestWindow(now: Date): Promise<number> {
  return releaseModerationTransparencyRange(
    new Date(Date.UTC(now.getUTCFullYear() - 3, 0, 1)),
    new Date(getCompleteDailyCohortCutoff(now).getTime() + 1),
  )
}

/** Releases the UTC day containing `occurredAt`. */
export function releaseTestDay(occurredAt: Date): Promise<number> {
  const day = new Date(
    Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate()),
  )
  return releaseModerationTransparencyRange(day, new Date(day.getTime() + 86_400_000))
}
