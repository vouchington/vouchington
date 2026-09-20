# Topic Recommendations API

Logged-in topic recommendation submission and queue review. Recommendations are stored as `topic_recommendation` posts plus a post extension row with explicit proposed-topic fields.

This workflow intentionally reuses shared post elections, caches, and metrics, while keeping authorization and lifecycle rules in the topic-recommendation service layer.

## Endpoints

| Method | Route                                        | Authentication   | Description                                         |
| ------ | -------------------------------------------- | ---------------- | --------------------------------------------------- |
| GET    | `/api/v1/topic-recommendations`              | Required         | List topic recommendations, always ranked by `best` |
| GET    | `/api/v1/topic-recommendations/top-hashtags` | Required         | List 30-day hashtag recommendations                 |
| GET    | `/api/v1/topic-recommendations/duplicates`   | Required         | Check for duplicate/similar topics before creating  |
| POST   | `/api/v1/topic-recommendations`              | Required         | Create a topic recommendation                       |
| GET    | `/api/v1/topic-recommendations/:id`          | Required         | Get one topic recommendation                        |
| PATCH  | `/api/v1/topic-recommendations/:id`          | Required         | Update a pending topic recommendation               |
| DELETE | `/api/v1/topic-recommendations/:id`          | Required         | Withdraw a pending topic recommendation             |
| POST   | `/api/v1/topic-recommendations/:id/approve`  | Required (admin) | Approve a recommendation and create the topic       |
| POST   | `/api/v1/topic-recommendations/:id/reject`   | Required (admin) | Reject a recommendation                             |

## GET /api/v1/topic-recommendations

Query parameters:

- `after` — score cursor for pagination
- `limit` — 1–100, default 25
- `q` — optional text filter against the recommendation title/body and proposed topic title/slug
- `status` — optional `pending`, `approved`, or `rejected`

Response is streamed and includes: `results`, `page_info`, `posts`, `posts_metrics`, `post_elections`, `markdown_to_html`, `bookmarks`, `election_votes`, `users` (keyed by reviewer ID — present only when reviewed posts exist).

## GET /api/v1/topic-recommendations/top-hashtags

Reads the refreshed `mv_top_hashtags` aggregate. `q` filters display/canonical hashtag text,
`mapping` is `all`, `linked`, or `unlinked`, and `after` is a scoped opaque ranking cursor.
The response includes typed hashtag results and a `topics` sidecar keyed by linked topic ID.

## GET /api/v1/topic-recommendations/:id

Response is streamed and includes: `post`, `post_metrics`, `post_election`, `markdown_to_html`, `bookmark`, `election_vote`, `users` (keyed by reviewer ID — present only when the recommendation has been reviewed).

## POST /api/v1/topic-recommendations

**Request:**

```json
{
  "title": "Optional rationale title",
  "markdown": "Why this topic should exist",
  "topic_title": "American Airlines AAdvantage Dining",
  "topic_slug": "american-airlines-aadvantage-dining",
  "topic_markdown": "Proposed topic description",
  "topic_hostname": "www.aadvantagedining.com",
  "topic_hostnames": ["www.aadvantagedining.com", "aadvantagediningrewards.com"],
  "topic_aliases": ["aadvantage dining"],
  "topic_type": "topic",
  "example_referral_link": null,
  "landing_page_urls": [],
  "cf_turnstile_response": "<Cloudflare Turnstile token>"
}
```

**CAPTCHA:** Requires a Cloudflare Turnstile token in `cf_turnstile_response`; the route calls `verifyCaptchaToken` (see [`@services/captcha`](../../../services/captcha/README.md)) — `422` if missing, `400` if rejected, `502` if siteverify is unreachable. (The `PATCH` update endpoint is not CAPTCHA-gated.) Requests carrying valid Apple App Attest headers bypass this Turnstile requirement — see [App Attest bypass](../../../services/captcha/README.md#app-attest-bypass) in `@services/captcha` (actionTag: `topic-recommendations.create`).

**Typed topic fields:**

| Field                   | Type                                      | Required when                   |
| ----------------------- | ----------------------------------------- | ------------------------------- |
| `topic_type`            | `"topic" \| "referral_program" \| "card"` | Optional (default: `"topic"`)   |
| `example_referral_link` | URL string                                | Required for `referral_program` |
| `landing_page_urls`     | Array of URL strings (≥1)                 | Required for `card`             |

Approval creates the type-specific extension row (`topics__referral_programs` or `topics__cards`) and adds landing-page URL relations for the type-specific URLs.

## Authorization

- Any logged-in user can list recommendations. Creation additionally requires a non-suspended,
  identity-verified contributor who passes the standard account-age/email gate (paid members and
  administrators bypass that standard gate) before request parsing and CAPTCHA.
- Any logged-in user can vote on pending recommendations through the shared post-election endpoints
- Creator or admin can edit while the recommendation is `pending`
- Creator or admin can withdraw while the recommendation is `pending`
- Only admins can approve or reject
- Generic `/api/v1/posts` and generic tools do not expose this post type
- Embedding content for these posts includes the recommendation rationale plus proposed topic details so similarity search can use the full request

## Performance

| Endpoint                                          | Round Trips | Caching                         | Notes                                                                                                             |
| ------------------------------------------------- | ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET /api/v1/topic-recommendations                 | 2           | Entities: Valkey batch          | Search → parallel streaming (posts, metrics, elections, markdown, bookmarks, votes, reviewer users)               |
| GET /api/v1/topic-recommendations/duplicates      | 3–5         | Bedrock embedding: Valkey 1 day | Parallel slug lookups + name lookup + pending-rec query + optional Bedrock embedding + vector search              |
| POST /api/v1/topic-recommendations                | 1           | None                            | Write; advisory lock + exact-topic duplicate check before insert                                                  |
| GET /api/v1/topic-recommendations/:id             | 3           | Entities: Valkey                | Fetch post → admin IDs + render markdown → parallel streaming (metrics, election, bookmarks, vote, reviewer user) |
| PATCH /api/v1/topic-recommendations/:id           | 2           | Entities: Valkey                | Fetch post + update                                                                                               |
| DELETE /api/v1/topic-recommendations/:id          | 2           | Entities: Valkey                | Fetch post + soft delete                                                                                          |
| POST /api/v1/topic-recommendations/:id/approvals  | 2           | Entities: Valkey                | Fetch post + approve                                                                                              |
| POST /api/v1/topic-recommendations/:id/rejections | 2           | Entities: Valkey                | Fetch post + reject                                                                                               |

## Related

- Service: [../../../services/topic-recommendations/](../../../services/topic-recommendations/README.md)
- Post service: [../../../services/posts/](../../../services/posts/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
