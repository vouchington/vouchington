export type ModerationAnalyticsRange = 'today' | '7d' | '30d' | '90d' | 'all'

export type ModerationAnalyticsScope =
  | {
      type: 'global'
    }
  | {
      type: 'community'
      communityId: string
    }

export type DailyCountDataPoint = {
  date: string
  count: number
}

export type DailyTypedCountDataPoint = {
  date: string
  type: string
  count: number
}

export type QueueVolumeMetrics = {
  total_reports: number
  pending_reports: number
  reports_over_time: DailyCountDataPoint[]
  clearance_actions_over_time: DailyTypedCountDataPoint[]
  moderator_actions_over_time: DailyTypedCountDataPoint[]
}

export type RuleViolationMetrics = {
  reasons: {
    reason: string
    count: number
  }[]
  reasons_over_time: DailyTypedCountDataPoint[]
}

export type AutomodPerformanceMetrics = {
  total_actions: number
  auto_removes: number
  reviewed_count: number
  false_positive_count: number
  false_positive_rate: number | null
  actions_over_time: DailyTypedCountDataPoint[]
  confidence_distribution: {
    bucket: string
    count: number
  }[]
  sources: {
    source_type: string
    count: number
  }[]
}

export type ModeratorWorkloadMetrics = {
  moderators: {
    actor_id: string
    total: number
    counts: Record<string, number>
    weekly_counts: DailyTypedCountDataPoint[]
  }[]
  users: Record<string, unknown>
}

export type AppealMetrics = {
  total_closed: number
  accepted: number
  reduced: number
  denied: number
  /** Backwards-compatible legacy bucket; denials are counted in `denied`. */
  dismissed: number
  success_rate: number | null
}

export type NewUserFrictionMetrics = {
  first_posts: number
  rejected_first_posts: number
  rejection_rate: number | null
}

export type ModerationAnalytics = {
  range: ModerationAnalyticsRange
  period_start: string
  period_end: string
  scope:
    | {
        type: 'global'
      }
    | {
        type: 'community'
        community_id: string
      }
  queue_volume: QueueVolumeMetrics
  rule_violations: RuleViolationMetrics
  automod_performance: AutomodPerformanceMetrics
  moderator_workload: ModeratorWorkloadMetrics
  appeals: AppealMetrics
  new_user_friction: NewUserFrictionMetrics
}
