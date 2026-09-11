export type GrowthRange = 'today' | '7d' | '30d' | '90d' | 'all'

export type DailyDataPoint = {
  date: string // ISO date string YYYY-MM-DD
  count: number
}

export type UserGrowth = {
  total_users: number
  new_users: number
  dau: number
  mau: number
  dau_mau_ratio: number
  signups_over_time: DailyDataPoint[]
}

export type ContentByType = {
  review: number
  data_point: number
  discussion: number
  comment: number
  story: number
}

export type ContentProduction = {
  total_posts: number
  posts_by_type: ContentByType
  contributions_per_active_user: number
  clearance_approval_rate: number
  content_over_time: DailyDataPoint[]
}

export type Engagement = {
  votes_cast: number
  comments_created: number
  follows_created: number
  avg_follows_per_user: number
  votes_over_time: DailyDataPoint[]
  comments_over_time: DailyDataPoint[]
  follows_over_time: DailyDataPoint[]
}

export type NetworkEffects = {
  referral_coefficient: number
  topic_coverage_rate: number // fraction of topics with >= 5 reviews
  landing_page_visits: number
  new_signups: number
  signup_visit_ratio: number
}

export type MembershipsByTier = Record<string, number>

export type Revenue = {
  active_memberships: number
  memberships_by_tier: MembershipsByTier
  mrr_by_currency: ScaledMoneyAggregate[]
  upgrades: number
  downgrades: number
  cancellations: number
  churn_rate: number
}

export type InfrastructureMetrics = {
  crawler_success_rate: number | null
  queue_throughput: number | null
  cache_hit_rate: number | null
  ai_token_usage: number | null
}

export type GrowthMetrics = {
  range: GrowthRange
  period_start: string // ISO datetime
  period_end: string // ISO datetime
  user_growth: UserGrowth
  content_production: ContentProduction
  engagement: Engagement
  network_effects: NetworkEffects
  revenue: Revenue
  infrastructure: InfrastructureMetrics
}
import type { ScaledMoneyAggregate } from '@ts-shared/money'
