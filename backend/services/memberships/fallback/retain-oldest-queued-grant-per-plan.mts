import type { MembershipPlanSlug } from '../types.mts'
import type { MembershipSourcePriority } from './select-highest-priority-source.mts'

type GrantFallbackSource = MembershipSourcePriority & {
  grant_created_at: Date | null
  has_open_grant_activation: boolean
}

/** Keeps the FIFO head of each queued-grant plan for the cross-source priority comparison. */
export function retainOldestQueuedGrantPerPlan<Source extends GrantFallbackSource>(
  sources: Source[],
): Source[] {
  const oldestQueuedGrantByPlan = new Map<MembershipPlanSlug, Source>()
  for (const source of sources) {
    if (source.source_kind !== 'admin_grant' || source.has_open_grant_activation) continue
    const grantCreatedAt = source.grant_created_at
    if (!grantCreatedAt) continue
    const preferred = oldestQueuedGrantByPlan.get(source.plan)
    const preferredGrantCreatedAt = preferred?.grant_created_at
    if (
      !preferred ||
      !preferredGrantCreatedAt ||
      grantCreatedAt < preferredGrantCreatedAt ||
      (grantCreatedAt.getTime() === preferredGrantCreatedAt.getTime() &&
        source.membership_source_id < preferred.membership_source_id)
    )
      oldestQueuedGrantByPlan.set(source.plan, source)
  }
  return sources.filter(
    source =>
      source.source_kind !== 'admin_grant' ||
      source.has_open_grant_activation ||
      oldestQueuedGrantByPlan.get(source.plan) === source,
  )
}
