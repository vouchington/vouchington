# GET /api/v1/my/referral-clicks

[Back to My API](README.md#get-apiv1myreferral-clicks)

Returns the current user's referral click log — every session that arrived via their referral link.

**Query parameters:**

- `after` — opaque pagination cursor
- `limit` — number of rows (1–100, default 25)

**Response:**

```json
{
  "results": [{ "__entity_type": "referral_click_log", "id": "..." }],
  "clicks": {
    "<id>": {
      "__entity_type": "referral_click_log",
      "id": "...",
      "landing_url": "https://voucha.ai/@alice",
      "signed_up_at": "2026-03-01T12:00:00Z",
      "user_id": "<uuid or null>",
      "created_at": "2026-03-01T11:55:00Z"
    }
  },
  "users": { "<user_id>": { "__entity_type": "user", "id": "...", "username": "..." } },
  "page_info": { "has_next_page": false, "start_cursor": "...", "end_cursor": null }
}
```

`users` only includes entries for clicks where `user_id IS NOT NULL` (signed-up referrals). Anonymous/unconverted clicks have `user_id: null` and `signed_up_at: null`.

**Authorization:** This endpoint returns only the authenticated user's own click log. `/api/v1/my/referral-clicks` always scopes to `currentUser.id`; there is no admin route to retrieve another user's log.

**Service:** [`backend/services/attribution/click-log.mts`](../../../services/attribution/click-log.mts)
