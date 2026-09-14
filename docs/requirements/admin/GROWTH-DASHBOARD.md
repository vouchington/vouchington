# Growth Dashboard Requirements

Admin- and investor-gated growth dashboard for tracking platform KPIs, feedback loops, and network effects.

## OKRs

| Objective                                   | Key Result                                                  |
| ------------------------------------------- | ----------------------------------------------------------- |
| **O1: Make the growth flywheel visible**    | Dashboard shows all Phase 1–3 GTM success metrics           |
| **O2: Enable data-driven growth decisions** | Each metric ties to a feedback loop with actionable insight |
| **O3: Make growth investable**              | Investors can self-serve growth data via `investor` role    |

## Access Control

| Role            | Access                  |
| --------------- | ----------------------- |
| `administrator` | Full access             |
| `investor`      | Full access (read-only) |
| All others      | Redirected (no access)  |

URL: `/growth`

## Date Range Filter

| Range   | Description            |
| ------- | ---------------------- |
| `today` | Since midnight UTC     |
| `7d`    | Last 7 days            |
| `30d`   | Last 30 days (default) |
| `90d`   | Last 90 days           |
| `all`   | All time\*             |

\* Infrastructure metrics (analytics) are capped at 90 days even for `all` to avoid unbounded scans.

Range is a URL search param (`?range=30d`), making state bookmarkable and shareable.

The backend coalesces concurrent requests and caches each range for 10 seconds. KPI queries reuse their PostgreSQL base scans within a load; the response shape and range semantics are unchanged.

## KPI Categories & Feedback Loops

### User Growth

| KPI           | Description                           |
| ------------- | ------------------------------------- |
| Total users   | All non-deleted users                 |
| New signups   | Users created in period               |
| DAU           | Distinct post authors in last 24h     |
| MAU           | Distinct post authors in last 30 days |
| DAU/MAU ratio | Engagement health (target: > 20%)     |

**Feedback loop:** Low signups → focus acquisition channels. Low DAU/MAU → improve retention and engagement.

### Content Production

| KPI                           | Description                                    |
| ----------------------------- | ---------------------------------------------- |
| Total posts (period)          | All post types in range                        |
| Posts by type                 | review, data_point, discussion, comment, story |
| Contributions per active user | Posts / distinct authors                       |
| Clearance approval rate       | Approved / (approved + rejected)               |

**Feedback loop:** Low contribution velocity → simplify submission flow, reduce friction.

### Engagement

| KPI                  | Description                        |
| -------------------- | ---------------------------------- |
| Votes cast           | Post votes in period               |
| Comments created     | Comment posts in period            |
| Follows created      | New follow relationships           |
| Avg follows per user | Total active follows / total users |

**Feedback loop:** Low engagement → improve content discovery, add nudges.

### Network Effects

| KPI                  | Description                                     |
| -------------------- | ----------------------------------------------- |
| Referral coefficient | Attributions per referring user (`referrer_id`) |
| Topic coverage rate  | % of topics with ≥ 5 reviews                    |
| Landing page visits  | Visit count in period                           |
| Landing page signups | New users in period (global, not LP-attributed) |
| LP conversion rate   | New users / landing page visits                 |

**Feedback loop:** Low referral coefficient → incentivize sharing. Low coverage → focus content seeding.

### Revenue

| KPI                                   | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| Active memberships                    | Count by tier                                 |
| MRR                                   | Monthly recurring revenue grouped by currency |
| Upgrades / downgrades / cancellations | Changes in period                             |
| Churn rate                            | Cancellations / membership base               |

**Feedback loop:** High churn → improve value prop. Low MRR → focus upgrade path.

`mrr_by_currency` is a list of exact scale-six money aggregates. Its `amount` is a canonical
non-negative integer string so a valid maximum membership price and same-currency totals remain
representable. Monthly and yearly prices are aggregated within each currency, annual prices are
divided by 12, and the result is rounded half-up once. Different currencies are never added
together. See [Monetary
Values](../../overview/architecture/monetary-values.md).

### Infrastructure

| KPI                  | Description                                 |
| -------------------- | ------------------------------------------- |
| Crawler success rate | % successful crawl requests (analytics)     |
| Queue throughput     | Total completed jobs (analytics)            |
| Cache hit rate       | Valkey cache hits / total calls (analytics) |
| AI token usage       | Embedding call tokens (analytics)           |

**Note:** Infrastructure metrics are best-effort — `null` is returned when the analytics store is unavailable. The dashboard shows "unavailable" rather than failing.

**Feedback loop:** High crawler failure → fix crawlers. Low cache hits → tune caching strategy.

## Frontend Components

| Component                      | Description                                     |
| ------------------------------ | ----------------------------------------------- |
| `growth-dashboard.tsx`         | Client orchestrator with date range state       |
| `date-range-filter.tsx`        | Select component, pushes `?range=` to URL       |
| `kpi-cards.tsx`                | Stat card grid (2 cols mobile, 4 cols desktop)  |
| `user-growth-chart.tsx`        | Signups over time (AreaChart)                   |
| `content-production-chart.tsx` | Total posts over time (AreaChart)               |
| `engagement-chart.tsx`         | Votes/comments/follows (LineChart)              |
| `revenue-chart.tsx`            | Memberships by tier (BarChart) + summary stats  |
| `network-effects-cards.tsx`    | Referral coefficient, coverage, funnel cards    |
| `content-health.tsx`           | Post type distribution + clearance rate         |
| `infrastructure-metrics.tsx`   | Analytics-sourced stat cards with null handling |

## API

`GET /api/v1/growth-metrics?range=30d`

See [backend/api/v1/admin/growth-metrics/README.md](../../../backend/api/v1/admin/growth-metrics/README.md) for full endpoint reference.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [Backend service](../../../backend/services/growth-metrics/README.md) — SQL and analytics approach
- [API endpoint](../../../backend/api/v1/admin/growth-metrics/README.md) — Auth, params, response shape
