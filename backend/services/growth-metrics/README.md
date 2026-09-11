# Growth Metrics Service

Aggregates platform growth KPIs for the admin/investor growth dashboard.

## What it does

Queries PostgreSQL and the local analytics store (`@data-stores/analytics`) to compute six categories of growth metrics:

| Category               | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| **User Growth**        | Total users, new signups, DAU/MAU ratio, onboarding completion rate    |
| **Content Production** | Posts by type, contributions per active user, clearance approval rate  |
| **Engagement**         | Votes cast, comments created, follows created                          |
| **Network Effects**    | Referral coefficient, topic data coverage, landing page funnel         |
| **Revenue**            | Active memberships by tier, MRR, churn rate                            |
| **Infrastructure**     | Crawler success rate, queue throughput, cache hit rate, AI token usage |

## Usage

```typescript
import { getGrowthMetrics, currentUserCanViewGrowthMetrics } from '@services/growth-metrics'

const metrics = await getGrowthMetrics('30d')
```

## Date Ranges

| Range   | Description              |
| ------- | ------------------------ |
| `today` | Since midnight UTC today |
| `7d`    | Last 7 days              |
| `30d`   | Last 30 days (default)   |
| `90d`   | Last 90 days             |
| `all`   | All time                 |

## SQL Design Notes

- UUIDv7-partitioned tables (`posts`) use `id > ${rangeStartUuid}` for partition pruning
- Non-partitioned tables use `created_at >= ${rangeStart}` or `uuid_extract_timestamp(id) >= ${rangeStart}`
- Time series buckets: daily for all ranges (via `DATE(...)` in SQL)
- DAU proxy: distinct `posts.created_by_id` in last 24 hours
- MAU proxy: distinct `posts.created_by_id` in last 30 days
- Topic coverage: uses `topic_metrics` pre-computed rating counts
- Revenue membership and change aggregates share one PostgreSQL statement snapshot so active,
  cancelled, and churn counts describe one coherent point in time
- MRR uses each direct Stripe production source's immutable `voucha-web` provider-observed price,
  PostgreSQL's exact `SUM(BIGINT)` result, and `BigInt` arithmetic. It returns a canonical scale-six
  integer string so valid prices and same-currency totals cannot overflow the wire format. Catalog
  repricing never rewrites MRR for existing subscribers.
- Reused PostgreSQL base sets are materialized within each request query so users, posts, referrals, memberships, and membership changes are not rescanned for sibling KPIs
- Complete results are promise-coalesced in process for 10 seconds per range to absorb dashboard refresh bursts without changing the response contract

## Authorization

Only `administrator` and `investor` roles can access growth metrics. See `authorization.mts`.

## Infrastructure Metrics

Analytics metrics are best-effort — if the query fails, the field returns `null` and the dashboard shows "unavailable". This prevents an analytics store failure from breaking the dashboard.

## Related

- [Growth Dashboard Requirements](../../../docs/requirements/admin/GROWTH-DASHBOARD.md)
- [Landing Page Analytics Service](../landing-page-analytics/README.md)
