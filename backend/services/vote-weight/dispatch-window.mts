import type { VoteWeightDispatchWindow } from '@queues/vote-aggregation/enqueues/types-dispatch'
import { getVoteWeightLookbackSeconds } from './work-limits.mts'

export function getVoteWeightDispatchWindow(
  signal: 'age_milestones' | 'membership_expirations' | 'family_source_changes',
  now = new Date(),
): VoteWeightDispatchWindow {
  return {
    windowStart: new Date(
      now.getTime() - getVoteWeightLookbackSeconds(signal) * 1000,
    ).toISOString(),
    windowEnd: now.toISOString(),
  }
}
