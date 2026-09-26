import { MONEY_SCALE } from '@ts-shared/money'
import type { GrowthMetrics } from '@/types/growth-metrics'

const signups = [
  { date: '2026-05-24', count: 28 },
  { date: '2026-05-25', count: 41 },
  { date: '2026-05-26', count: 33 },
]

export const growthMetrics: GrowthMetrics = {
  range: '30d',
  period_start: '2026-04-26T00:00:00.000Z',
  period_end: '2026-05-26T00:00:00.000Z',
  user_growth: {
    total_users: 18_420,
    new_users: 640,
    dau: 2104,
    mau: 9800,
    dau_mau_ratio: 0.215,
    signups_over_time: signups,
  },
  content_production: {
    total_posts: 1260,
    posts_by_type: {
      review: 180,
      data_point: 240,
      discussion: 310,
      comment: 470,
      story: 60,
    },
    contributions_per_active_user: 2.4,
    clearance_approval_rate: 0.91,
    content_over_time: [
      { date: '2026-05-24', count: 40 },
      { date: '2026-05-25', count: 52 },
      { date: '2026-05-26', count: 37 },
    ],
  },
  engagement: {
    votes_cast: 8420,
    comments_created: 470,
    follows_created: 960,
    avg_follows_per_user: 3.2,
    votes_over_time: [{ date: '2026-05-25', count: 280 }],
    comments_over_time: [{ date: '2026-05-25', count: 16 }],
    follows_over_time: [{ date: '2026-05-25', count: 32 }],
  },
  network_effects: {
    referral_coefficient: 0.42,
    topic_coverage_rate: 0.37,
    landing_page_visits: 5100,
    new_signups: 640,
    signup_visit_ratio: 0.125,
  },
  revenue: {
    active_memberships: 860,
    memberships_by_tier: { plus: 540, pro: 320 },
    mrr_by_currency: [{ amount: '4820000000', currency: 'usd', scale: MONEY_SCALE }],
    upgrades: 48,
    downgrades: 11,
    cancellations: 17,
    churn_rate: 0.02,
  },
  infrastructure: {
    crawler_success_rate: 0.986,
    queue_throughput: 12_040,
    cache_hit_rate: 0.91,
    ai_token_usage: 2_400_000,
  },
}

export const quietGrowthMetrics: GrowthMetrics = {
  ...growthMetrics,
  user_growth: {
    ...growthMetrics.user_growth,
    new_users: 0,
    dau: 0,
    dau_mau_ratio: 0,
    signups_over_time: [],
  },
  infrastructure: {
    crawler_success_rate: null,
    queue_throughput: null,
    cache_hit_rate: null,
    ai_token_usage: null,
  },
}
