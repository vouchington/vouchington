export const growthMetricsBody = {
  range: '30d',
  period_start: '2026-06-05T00:00:00.000Z',
  period_end: '2026-07-05T12:00:00.000Z',
  user_growth: {
    total_users: 1200,
    new_users: 85,
    dau: 240,
    mau: 800,
    dau_mau_ratio: 0.3,
    signups_over_time: [
      { date: '2026-07-01', count: 3 },
      { date: '2026-07-02', count: 7 },
    ],
  },
  content_production: {
    total_posts: 430,
    posts_by_type: {
      review: 120,
      data_point: 80,
      discussion: 150,
      comment: 70,
      story: 10,
    },
    contributions_per_active_user: 1.4,
    clearance_approval_rate: 0.91,
    content_over_time: [
      { date: '2026-07-01', count: 14 },
      { date: '2026-07-02', count: 18 },
    ],
  },
  engagement: {
    votes_cast: 2100,
    comments_created: 320,
    follows_created: 45,
    avg_follows_per_user: 3.2,
    votes_over_time: [
      { date: '2026-07-01', count: 70 },
      { date: '2026-07-02', count: 82 },
    ],
    comments_over_time: [
      { date: '2026-07-01', count: 10 },
      { date: '2026-07-02', count: 15 },
    ],
    follows_over_time: [
      { date: '2026-07-01', count: 1 },
      { date: '2026-07-02', count: 4 },
    ],
  },
  network_effects: {
    referral_coefficient: 2.4,
    topic_coverage_rate: 0.38,
    landing_page_visits: 1800,
    new_signups: 45,
    signup_visit_ratio: 0.025,
  },
  revenue: {
    active_memberships: 95,
    memberships_by_tier: { plus: 60, premium: 30, pro: 5 },
    mrr_by_currency: [{ amount: '2850000000', currency: 'usd', scale: 6 }],
    upgrades: 8,
    downgrades: 2,
    cancellations: 4,
    churn_rate: 0.04,
  },
  infrastructure: {
    crawler_success_rate: 0.96,
    queue_throughput: 14_200,
    cache_hit_rate: 0.88,
    ai_token_usage: 4_800_000,
  },
}
