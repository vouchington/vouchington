# Growth Metrics API

Platform growth KPIs for the admin/investor dashboard.

## Endpoint

### `GET /api/v1/growth-metrics`

Returns aggregated growth metrics across all 6 KPI categories for a given time range.

#### Auth

Requires either `administrator` or `investor` role. Returns 401 for unauthenticated requests, 403 for users without either role.

#### Query Parameters

| Parameter | Type   | Default | Description                                                                        |
| --------- | ------ | ------- | ---------------------------------------------------------------------------------- |
| `range`   | string | `30d`   | Time range: `today`, `7d`, `30d`, `90d`, `all`. Invalid values fall back to `30d`. |

#### Response Shape

```json
{
  "range": "30d",
  "period_start": "2024-05-15T00:00:00.000Z",
  "period_end": "2024-06-15T14:30:00.000Z",
  "user_growth": {
    "total_users": 1200,
    "new_users": 85,
    "dau": 240,
    "mau": 800,
    "dau_mau_ratio": 0.3,
    "signups_over_time": [{ "date": "2024-05-16", "count": 3 }]
  },
  "content_production": {
    "total_posts": 430,
    "posts_by_type": {
      "review": 120,
      "data_point": 80,
      "discussion": 150,
      "comment": 70,
      "story": 10
    },
    "contributions_per_active_user": 1.4,
    "clearance_approval_rate": 0.91,
    "content_over_time": [{ "date": "2024-05-16", "count": 14 }]
  },
  "engagement": {
    "votes_cast": 2100,
    "comments_created": 320,
    "follows_created": 45,
    "avg_follows_per_user": 3.2,
    "votes_over_time": [{ "date": "2024-05-16", "count": 70 }],
    "comments_over_time": [{ "date": "2024-05-16", "count": 10 }],
    "follows_over_time": [{ "date": "2024-05-16", "count": 1 }]
  },
  "network_effects": {
    "referral_coefficient": 2.4,
    "topic_coverage_rate": 0.38,
    "landing_page_visits": 1800,
    "new_signups": 45,
    "signup_visit_ratio": 0.025
  },
  "revenue": {
    "active_memberships": 95,
    "memberships_by_tier": { "plus": 60, "premium": 30, "pro": 5 },
    "mrr_by_currency": [{ "amount": "2850000000", "currency": "usd", "scale": 6 }],
    "upgrades": 8,
    "downgrades": 2,
    "cancellations": 4,
    "churn_rate": 0.04
  },
  "infrastructure": {
    "crawler_success_rate": 0.96,
    "queue_throughput": 14200,
    "cache_hit_rate": 0.88,
    "ai_token_usage": 4800000
  }
}
```

`infrastructure` fields are `null` if the analytics store is unavailable (graceful degradation).
MRR is grouped by currency and returned as exact scale-six aggregate money. The canonical integer
string amount preserves totals beyond the JSON-safe integer range; currencies are never summed
together.

## Performance

| Endpoint                   | Phases | Caching              | Notes                                                                                                     |
| -------------------------- | ------ | -------------------- | --------------------------------------------------------------------------------------------------------- |
| GET /api/v1/growth-metrics | 2      | 10s coalescing cache | Auth, then one consolidated PostgreSQL/analytics batch; concurrent identical reads share the same refresh |
