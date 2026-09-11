export type ModerationAnalyticsRange = 'today' | '7d' | '30d' | '90d' | 'all'

export type ModerationTransparencyMetric =
  | 'appeals'
  | 'automated_moderation'
  | 'moderation_actions'
  | 'reports'

export interface ModerationTransparency {
  range: ModerationAnalyticsRange
  next_cursor?: string
  buckets: {
    date: string
    metric: ModerationTransparencyMetric
    category: string
    count: number
  }[]
}

export interface DailyCountDataPoint {
  date: string
  count: number
}

export interface DailyTypedCountDataPoint {
  date: string
  type: string
  count: number
}

export interface ModerationAnalytics {
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
  queue_volume: {
    total_reports: number
    pending_reports: number
    reports_over_time: DailyCountDataPoint[]
    clearance_actions_over_time: DailyTypedCountDataPoint[]
    moderator_actions_over_time: DailyTypedCountDataPoint[]
  }
  rule_violations: {
    reasons: {
      reason: string
      count: number
    }[]
    reasons_over_time: DailyTypedCountDataPoint[]
  }
  automod_performance: {
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
  moderator_workload: {
    moderators: {
      actor_id: string
      total: number
      counts: Record<string, number>
      weekly_counts: DailyTypedCountDataPoint[]
    }[]
    users: Record<string, { username?: string | null } | null>
  }
  appeals: {
    total_closed: number
    accepted: number
    reduced: number
    denied: number
    /** Backwards-compatible legacy bucket; denials are counted in `denied`. */
    dismissed: number
    success_rate: number | null
  }
  new_user_friction: {
    first_posts: number
    rejected_first_posts: number
    rejection_rate: number | null
  }
}
