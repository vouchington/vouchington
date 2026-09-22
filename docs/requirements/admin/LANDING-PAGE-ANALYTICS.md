# Landing Page Analytics

Landing page analytics surface performance data to landing page owners and administrators,
creating a feedback loop that motivates sharing and distribution of `@username` landing pages
while still giving staff a cross-client support and review path.

Visitors with active Global Privacy Control are excluded from landing-page visit and click
analytics. The browser client skips `sendBeacon`, and the backend returns success without recording
analytics when `Sec-GPC: 1` or worker-normalized `x-voucha-gpc: 1` is present.

## KPIs

| KPI                  | Description                                                  | Feedback Loop                                                     |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Unique Visitors      | Count of distinct sessions visiting the page (30-day window) | Validates that sharing reaches real people                        |
| Visit Trend          | Daily visits and unique visitors over 30 days                | Shows growth trajectory, motivates continued sharing              |
| UTM Source Breakdown | Top 20 traffic sources by utm_source parameter               | Reveals which platforms drive traffic, motivates targeted sharing |
| Click-Through Rate   | Ratio of item clicks to page visits                          | Measures content quality and relevance                            |
| Conversion Funnel    | Visits → Clicks → Signups pipeline                           | Ultimate proof that sharing drives growth                         |
| Per-Item Clicks      | Click counts per landing page item                           | Shows which content performs best, motivates curation             |

## Conversion Funnel

Three-stage funnel: **Visits → Clicks → Signups**

- **Visits**: Total page visits from the analytics store's `web_page_view` (`page_kind = 'landing_page'`)
- **Clicks**: Total item clicks from the analytics store's `web_click` (`page_kind = 'landing_page'`, `target_kind = 'item'`)
- **Signups**: Users who signed up via the landing page owner's referral (`users.referrer_id = landingPage.user_id`)

Note: Signups are tracked at the user level (not per landing page), since `users.referrer_id` attributes signups to the referring user regardless of which specific landing page was visited. Admin analytics must use the landing page owner's user id, not the administrator viewing the page.

## UTM Tracking

Landing page visits track four UTM parameters: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`. The analytics dashboard shows a breakdown by `utm_source` (top 20 sources within the 30-day window). Visits without a `utm_source` are grouped as "direct".

## Authorization

Owner analytics are available to landing page owners with an active or past-due Plus or Pro
membership. Free, paused, cancelled, and expired memberships do not receive analytics. The
administrator route remains a separate staff-only cross-user capability.

Administrators can view analytics for any user's landing pages. Other staff roles do not get this cross-client analytics access.

## Data Sources

| Table                           | Purpose                                                                      | Store                                      |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `web_page_view`                 | Page visit events with UTM params (`page_kind = 'landing_page'`)             | Analytics store (`@data-stores/analytics`) |
| `web_click`                     | Per-item click events (`page_kind = 'landing_page'`, `target_kind = 'item'`) | Analytics store (`@data-stores/analytics`) |
| `session_referral_attributions` | Session-to-referrer mapping                                                  | PostgreSQL, not partitioned                |
| `users.referrer_id`             | Signup attribution                                                           | PostgreSQL, N/A                            |

## UI Location

- Owner web route: `/my/landing-page/:slug/analytics`, backed by `GET /api/v1/my/landing-pages/:pageId/analytics`.
- Admin web route: `/admin/landing-pages/:pageId/analytics`, backed by `GET /api/v1/admin/landing-pages/:pageId/analytics`.
- Admin discovery route: `/user/:idOrUsername/admin` lists the target user's landing pages via `GET /api/v1/admin/users/:userId/landing-pages`.
- Swift: owner landing-page management shows selected-page analytics; administrator native profile rows and public landing-page routes use the admin endpoints.
- .NET: owner landing-page management shows selected-page analytics; administrator public profile pages list target landing pages and open a native analytics page.

## Future Enhancements

- **Time period selector**: Allow choosing day/week/month/custom range (currently a fixed window — see the `INTERVAL '30 days'` literals in `getLandingPageAnalyticsByPageId`, `backend/services/landing-page-analytics/get-analytics.mts`, e.g. the `unique_visitors` filter)
- **Per-page signups**: Track which specific landing page drove each signup (requires schema change)
- **Comparative rankings**: "Your page is in the top X% of landing pages this month"
- **Sharing nudges**: Congratulatory notifications when milestones are reached
- **Email digest integration**: Include analytics summary in periodic email digests (#1167, #1351)

## Related

- [Memberships](../users/memberships.md) — tier-based feature gating
- [Referral Links](../users/REFERRAL-LINKS.md) — referral link analytics (separate from landing page analytics)
- [Landing page analytics service](../../../backend/services/landing-page-analytics/README.md) — event collection and analytics pipeline
- [Web rules](../../../web/CLAUDE.md) — landing page UI components
