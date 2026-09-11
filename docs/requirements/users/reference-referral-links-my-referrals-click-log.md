# Referral Links reference

[Back to Referral Links](REFERRAL-LINKS.md)

## My Referrals (Click Log)

### Route

`/my/referrals` — requires authentication.

### Purpose

Shows the authenticated user their referral click history: every session that arrived via their referral link, whether it converted to a signup, and who signed up (if the signup user has a public profile).

### API

**`GET /api/v1/my/referral-clicks`**

- **Auth**: Required
- **Query params**: `after` (cursor), `limit` (1–100, default 25)
- **Response**:

```json
{
  "results": [{ "__entity_type": "referral_click_log", "id": "..." }],
  "clicks": {
    "<id>": {
      "__entity_type": "referral_click_log",
      "id": "...",
      "landing_url": "https://voucha.com/@alice",
      "signed_up_at": "2026-03-01T12:00:00Z",
      "user_id": "<uuid>",
      "created_at": "2026-03-01T11:55:00Z"
    }
  },
  "users": {
    "<user_id>": {
      "__entity_type": "user",
      "id": "...",
      "username": "...",
      "profile_image_id": null
    }
  },
  "page_info": { "has_next_page": false, "start_cursor": "...", "end_cursor": null }
}
```

Cursor paginates on `session_referral_attributions.id DESC`. `users` map only contains entries for rows where `user_id IS NOT NULL` and the user account still exists. Anonymous/unconverted clicks have `user_id: null` and `signed_up_at: null`.

### Authorization

- Users may only view their own click log via `GET /api/v1/my/referral-clicks` (always scoped to `currentUser.id`)
- Referral management and click-log features require authentication; public prioritized referral links remain available with optional authentication. Referral access is not gated by membership tier.
- **Exception:** the Amex Unfurl action (`POST /api/v1/referral-links/:linkId/unfurls`) requires an active Plus/Pro membership (`hasPlusTier`) — see [referral-link anatomy § Child links (Amex unfurl)](../anatomy/referral-link.md). This is the one referral-link action gated by membership tier; adding, editing, activating, deactivating, and deleting a link (including a parent link created for unfurling) remain ungated.

### Native Analytics

SwiftUI and .NET MAUI expose the referral click log natively on the referrals surface. Rows show
the landing URL, click time, and signup status: linked username when available, anonymous for a
converted user without a public profile entry, or no signup state for unconverted clicks. Pagination
uses `page_info.end_cursor`.

### CTA Aside

When a visitor lands on any page with a `?referrer=<username>` query parameter:

- Shown only to **unauthenticated** visitors (hidden for logged-in users)
- Dismissible (client-side state; dismissed on any CTA click)
- Displayed as a sidebar aside
- Contains 4 CTAs:
  1. Sign up
  2. Share a referral link
  3. Share a data point or review
  4. Share your landing page
- Purpose: convert referred visitors into new users

## Link Health Checking

Referral links are periodically crawled to verify they are still accessible. The crawl uses the standard HTML crawler pipeline but skips embedding generation.

### Schedule

Links are checked weekly (Sunday 4 AM UTC). Links that were successfully crawled within the last 7 days are skipped. Links that failed within the last hour are also skipped to avoid hammering broken servers.

### Auto-Deactivation

Broken links are automatically deactivated based on error type:

| Error type                | Behavior                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| 200 OK                    | Reset failure counter, update last success timestamp               |
| 404 / 410                 | Immediate deactivation (page removed)                              |
| 5xx / timeout / DNS error | Increment failure counter; deactivate after 3 consecutive failures |
| 429 (rate limited)        | No penalty (server is alive but busy)                              |

Deactivated links can be manually reactivated by the user if the URL becomes accessible again.

## Referral Link Detection in Posts

Posts are automatically scanned for embedded referral links after creation or content changes. This runs as part of the spam detection pipeline.

### Detection

URLs extracted from post markdown are checked against all enabled referral program validation rules using cursor-based streaming. A URL is flagged if it matches a rule where `is_referral_link_url = TRUE`.

### Consequences

When referral links are detected in a post:

1. **Spam signal**: The `referral_link_in_post` signal fires with score 1.0 and weight 0.20, contributing to the post's composite spam score
2. **Post rejection**: If the composite spam score exceeds the threshold (0.6), the post is rejected via the clearance gate
3. **Vote penalty**: A 0.2 vote weight penalty is applied to the post author (idempotent per post — re-analysis does not stack penalties for the same post)

### Limitations

This detection is deterministic and only catches referral links registered in the system's validation rules. Unregistered referral link patterns will not be detected.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](./ACCOUNT-DELETION-DATA-REQUEST.md)
