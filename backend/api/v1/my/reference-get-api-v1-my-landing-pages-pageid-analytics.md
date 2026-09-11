# GET /api/v1/my/landing-pages/:pageId/analytics

[Back to My API](README.md#get-apiv1mylanding-pagespageidanalytics)

Returns a 30-day rolling analytics summary for the specified landing page. Requires page ownership.

**Response shape:**

```json
{
  "analytics": {
    "total_visits": 1250,
    "total_clicks": 340,
    "unique_visitors": 420,
    "ctr": 0.272,
    "item_clicks": [
      { "item_id": "uuid", "item_type": "profile_link", "click_count": 180 },
      { "item_id": "uuid", "item_type": "referral_link", "click_count": 160 }
    ],
    "daily_stats": [
      { "date": "2026-03-23", "visits": 45, "unique_visitors": 38, "clicks": 12 },
      { "date": "2026-03-22", "visits": 42, "unique_visitors": 35, "clicks": 10 }
    ],
    "utm_sources": [
      { "utm_source": "twitter", "visits": 580 },
      { "utm_source": "direct", "visits": 340 }
    ],
    "conversion_funnel": {
      "total_visits": 1250,
      "total_clicks": 340,
      "total_signups": 28,
      "visit_to_click_rate": 0.272
    }
  }
}
```

**Performance:** Checks page ownership, reads analytics, and looks up signup attribution from the landing page owner's `users.referrer_id` via the attribution service.
