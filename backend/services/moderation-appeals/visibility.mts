import type { ModerationAppealResponse } from './types.mts'

/** Resolved member history remains readable for 24 calendar months; pending appeals stay open. */
export function isModerationAppealVisibleToAppellant(
  appeal: Pick<ModerationAppealResponse, 'resolved_at'>,
  now: Date = new Date(),
): boolean {
  if (!appeal.resolved_at) return true
  const visibilityCutoff = new Date(now)
  visibilityCutoff.setUTCDate(1)
  visibilityCutoff.setUTCMonth(visibilityCutoff.getUTCMonth() - 24)
  const lastDayOfCutoffMonth = new Date(
    Date.UTC(visibilityCutoff.getUTCFullYear(), visibilityCutoff.getUTCMonth() + 1, 0),
  ).getUTCDate()
  visibilityCutoff.setUTCDate(Math.min(now.getUTCDate(), lastDayOfCutoffMonth))
  return appeal.resolved_at >= visibilityCutoff
}
