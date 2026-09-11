# landing-page-analytics

Records visits and item clicks on user landing pages. Provides aggregate analytics (total visits, unique visitors, CTR, UTM source breakdown, conversion funnel, per-item clicks, daily trend) to landing page owners.

Global Privacy Control is enforced at the API boundary: requests with `Sec-GPC: 1` or
`x-voucha-gpc: 1` return success without calling these recorders. The client also avoids sending
landing-page analytics beacons when `navigator.globalPrivacyControl === true`.

## Storage

There are no dedicated PostgreSQL analytics tables. Visit and click events are emitted to the shared
analytics store (`@data-stores/analytics`) via `@services/analytics`, tagged `page_kind = 'landing_page'`:

**`web_page_view`** — one row per visit to a landing page

- `page_id` (landing page id), `session_id`, `referrer` (HTTP header), UTM params
- Analytics store table (DuckDB/JSONL-backed); no retention policy

**`web_click`** — one row per click on an item within a landing page

- `page_id` (landing page id), `target_kind = 'item'`, `target_id` (landing page item id), `group_member_id` (nullable), `session_id`
- Analytics store table (DuckDB/JSONL-backed); no retention policy

PostgreSQL (`user_landing_pages`, `user_landing_page_items`, `user_landing_page_group_members`) is
read only to validate that the landing page, item, and group member exist before emitting an event.

## API

```ts
// Record a landing page visit (fire-and-forget)
recordLandingPageVisit({ landingPageId, sessionId, referrer?, utmSource?, utmMedium?, utmCampaign?, utmContent? })

// Record a click on a landing page item (fire-and-forget; validates item belongs to page)
recordLandingPageItemClick({ landingPageId, landingPageItemId, groupMemberId?, sessionId })

// Aggregate analytics for a landing page (ownership check retained for owner-facing callers)
getLandingPageAnalytics(currentUserId, landingPageId)
// Aggregate analytics for any existing landing page
getLandingPageAnalyticsByPageId(landingPageId)
// Returns: { total_visits, total_clicks, unique_visitors, ctr, item_clicks[], daily_stats[], utm_sources[] }
// Note: conversion_funnel is composed by the API route (combines analytics + signup count from attribution service)
```

## Analytics Response

`getLandingPageAnalytics` returns a 30-day rolling window:

- **total_visits** / **total_clicks** — all-time counts
- **unique_visitors** — distinct session count within 30-day window
- **ctr** — click-through rate (clicks / visits)
- **item_clicks[]** — per-item click counts with item_type
- **daily_stats[]** — daily visits, unique visitors, and clicks (30-day window)
- **utm_sources[]** — top 20 UTM sources by visit count (30-day window, "direct" for untagged)

API routes compose a **conversion_funnel** by combining analytics data with signup count from the landing page owner's `users.referrer_id`.

## Authorization

`currentUserCanViewLandingPageAnalytics()` requires an active or past-due Plus or Pro membership.
The owner route loads that membership before composing analytics; administrators retain their separate
cross-user analytics route and raw staff access.

## Attribution

Landing pages served at `/@username` and `/@username/slug` automatically create session referral attributions via the Next.js proxy. The landing page analytics events are separate from attribution — they track page performance, not signup referral.

## Related

- [backend/api/v1/landing-pages/README.md](../../api/v1/landing-pages/README.md)
- [docs/requirements/admin/LANDING-PAGE-ANALYTICS.md](../../../docs/requirements/admin/LANDING-PAGE-ANALYTICS.md)
