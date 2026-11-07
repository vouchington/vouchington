import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getQueueVolume } from './moderation-analytics-queue-volume.mts'
import { getRuleViolations } from './moderation-analytics-rule-violations.mts'
import { getAutomodPerformance } from './moderation-analytics-automod-performance.mts'
import { getModeratorWorkload } from './moderation-analytics-workload.mts'
import { getAppeals, getNewUserFriction } from './moderation-analytics-appeals.mts'
import type {
  ModerationAnalytics,
  ModerationAnalyticsRange,
  ModerationAnalyticsScope,
} from './types.mts'

export async function getModerationAnalytics(
  range: ModerationAnalyticsRange,
  scope: ModerationAnalyticsScope,
): Promise<ModerationAnalytics> {
  const now = new Date()
  const periodStart = getRangeStart(range, now)
  const periodStartUuid = getMinUUIDv7ForDate(periodStart)

  const [
    queueVolume,
    ruleViolations,
    automodPerformance,
    moderatorWorkload,
    appeals,
    newUserFriction,
  ] = await Promise.all([
    getQueueVolume(periodStartUuid, scope),
    getRuleViolations(periodStartUuid, scope),
    getAutomodPerformance(periodStartUuid, scope),
    getModeratorWorkload(periodStartUuid, scope),
    getAppeals(periodStart, scope),
    getNewUserFriction(periodStartUuid, scope),
  ])

  return {
    range,
    period_start: periodStart.toISOString(),
    period_end: now.toISOString(),
    scope:
      scope.type === 'community'
        ? { type: 'community', community_id: scope.communityId }
        : { type: 'global' },
    queue_volume: queueVolume,
    rule_violations: ruleViolations,
    automod_performance: automodPerformance,
    moderator_workload: moderatorWorkload,
    appeals,
    new_user_friction: newUserFriction,
  }
}

function getRangeStart(range: ModerationAnalyticsRange, now: Date): Date {
  const d = new Date(now)
  switch (range) {
    case 'today': {
      d.setUTCHours(0, 0, 0, 0)
      return d
    }
    case '7d': {
      d.setUTCDate(d.getUTCDate() - 7)
      return d
    }
    case '30d': {
      d.setUTCDate(d.getUTCDate() - 30)
      return d
    }
    case '90d': {
      d.setUTCDate(d.getUTCDate() - 90)
      return d
    }
    case 'all': {
      // The raw moderation sources have finite windows. "All" means the full
      // available analytics window, not an unbounded scan back to the epoch.
      d.setUTCDate(d.getUTCDate() - 90)
      return d
    }
  }
}
