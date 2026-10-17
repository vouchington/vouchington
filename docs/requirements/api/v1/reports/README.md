# Reports API

Guard-pinned token mirror: `static-code-analysis/repo-file-policy/moderation-policy-doc-sync-guard.mts`
requires the report entity and reason lists here to match `MODERATION_POLICY`. The routes themselves
are read from `backend/api/v1/reports`.

Canonical `entityType` values are `rss_feed_item`, `post`, `comment`, `user`, `url_hostname`.

## Endpoints

```json
{
  "entityType": "rss_feed_item" | "post" | "comment" | "user" | "url_hostname",
  "reason": "spam" | "harassment" | "misinformation" | "illegal_content" | "vote_manipulation" | "other"
}
```

Reasons: spam harassment misinformation illegal_content vote_manipulation other.
vote_manipulation is valid only for post reports.
