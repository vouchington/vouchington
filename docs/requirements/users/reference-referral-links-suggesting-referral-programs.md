# Referral Links reference

[Back to Referral Links](REFERRAL-LINKS.md)

## Suggesting Referral Programs

Users can suggest a new referral program topic via the topic recommendations flow at
`/topic-recommendations/create?type=referral_program`. When the **Referral Program** type is
selected, the form requires an **Example Referral Link** (a full URL). This link is stored as
`example_referral_link` on the topic recommendation. Admins can edit this field in the review
dialog before approving. See [TOPICS.md § Type Selector](../content/reference-topics-creating-topics.md#type-selector) for the full
type-selector specification.

## Priority Ordering

Each referral link owner appears in exactly one group — their highest priority match. Groups are displayed in order from highest to lowest priority.

| Group | Description                                             | Auth required |
| ----- | ------------------------------------------------------- | ------------- |
| 1     | Mutual follows                                          | Yes           |
| 2     | One-way follows (you follow them)                       | Yes           |
| 3     | Sign-up referrers                                       | Yes           |
| 4     | Authors whose posts received your positive trust choice | Yes           |
| 5     | Everyone else                                           | No            |

- **Signed-out users** see only group 5 (everyone else).
- **Signed-in users** see all 5 groups.
- Users are **deduplicated** — each user appears in their highest priority group only.

## Sorting Within Groups

Within each priority group, links are sorted by these criteria in order:

1. **Contribution rank** — users with both a data point + review rank highest (rank 1), then either one (rank 2), then neither (rank 3)
2. **Membership tier** — pro (rank 1) > plus (rank 2) > free (rank 3)
3. **Best score** — highest `MAX(votes_score_net)` of their data points/reviews, descending

Contributions are checked against the referral program's own topic AND all topics linked to it via `topics.referral_program_id` (via `post_data_point_topics` and `post_review_topic_ratings`). For example, a data point about "Chase Sapphire Preferred" (a card topic linked to the "Chase Sapphire Referral" program) counts toward the user's contribution rank for that referral program.

## Limit Logic

- **Friends always shown** — all links from groups 1+2 are included regardless of count
- **5 total cap** — remaining slots (groups 3-5) fill up to 5 total links
- If groups 1+2 already have ≥ 5 links, groups 3-5 are omitted entirely
- **Anonymous users** — all links are group 5, limited to 5; `?all=true` requires authentication (401 for signed-out users)

## API Endpoints

### GET `/api/v1/topics/:id/prioritized-referral-links`

Returns referral links for a given referral program (topic ID) as a flat sorted array.

- **Auth**: Optional (signed-out users get group 5 only)
- **Query params**: `?all=true` — returns all links with no limit, includes the current user's own link; all links have `priority_group=5` (no group assignment)
- **Response**:

```json
{
  "links": [
    {
      "id": "...",
      "user_id": "...",
      "referral_program_id": "...",
      "url": "...",
      "label": "...",
      "priority_group": 1,
      "contribution_rank": 1,
      "tier_rank": 2,
      "best_score": 42,
      "review_post_id": "...",
      "review_post_slug": "my-chase-sapphire-review",
      "review_avg_rating": 4.5
    }
  ],
  "users": { "user-id": { "id": "...", "username": "...", "display_name": "..." } }
}
```

The `links` array is sorted by `priority_group`, then `contribution_rank`, then `tier_rank`, then `best_score DESC`. The limit logic is applied server-side (groups 1+2 always, fill groups 3-5 up to 5 total).

`review_post_id`, `review_post_slug`, and `review_avg_rating` are the link owner's best review (by `votes_score_net`) for the referral program's linked topics. All three are `null` when the owner has no matching review.

## UI Behavior

### Aside (Topic Pages)

- Displayed on topic pages for referral program topics and on any topic pages linked to a referral program via `topics.referral_program_id`

For aside card fields, top-N display, and CTA behavior, see [referral-link anatomy → Detail Anatomy](../anatomy/referral-link.md#detail-anatomy).

### Tab (Full View)

- Route: `/:topicType/:id/referral-links`

For group organization, card fields, add/edit form, and Show All behavior, see [referral-link anatomy → Detail Anatomy](../anatomy/referral-link.md#detail-anatomy).

### Personal Feed (`/feed/referral-links`)

- **Route**: `/feed/referral-links` (Following) and `/feed/referral-links/mutual` (Mutual Friends)
- **Auth**: required; automatically gated by `web/app/feed/layout.tsx`
- **Audience**: referral links posted by users you follow (Following mode) or mutual followers (Mutual Friends mode)
- **Excludes**: the viewer's own links; links from muted/blocked users; deactivated links (`deactivated_at IS NULL`)
- **Sub-filter dropdown**: Following (default, `feed_type=follow_users`) / Mutual Friends (`feed_type=mutual_follows`)
- **Empty state**: two CTAs — "Find Friends" → `/my/friend-recommendations` and "Share Your Links" → `/my/referral-links`
- **Card**: see [referral-link anatomy → List-Item / Card Anatomy](../anatomy/referral-link.md#list-item--card-anatomy)
- **Endpoint**: `GET /api/v1/feeds/referral_links/{follow_users|mutual_follows}`; keyset cursor on `urpl.id DESC`; returns `{ results, users, page_info }`

### Review Coupling

Referral links and reviews are tightly coupled:

- **Referral link cards and post card badges** — for card field display and the review-rating and "Referral" badge rendering, see [referral-link anatomy → List-Item / Card Anatomy](../anatomy/referral-link.md#list-item--card-anatomy).
- **Review detail pages** (`/review/:id`) show a "Referral Links" card below the action bar listing all referral programs for the reviewed topics, with links to the referral links tab for each. The aside also shows prioritized referral links for the first referral program found.
- **Post detail aside** (`PostReviewReferralLinksAside`) shows on review post pages when the reviewed topics have referral programs.

## Blocked as Related Links

Referral URLs belong on the dedicated referral-links surface, not on related-link surfaces (post → related → url, topic → related → url, related-URL tags on discussions). Enforcement lives in `upsertEntityRelation` (`backend/services/entity-relations/upsert.mts`), which calls `assertUrlsAreNotReferralLinks` from `@services/referral-program-link-validations` before inserting any `object_type === 'url'` relation with `predicate === 'related'` (bookmarks, topic URL metadata predicates, and other non-related URL relations are intentionally excluded). Matching streams referral-program rules from PostgreSQL via the cursor in `containsReferralLinks` (batchSize 500, early-exit when every URL is matched), so the full rule set is never loaded into memory. A rejection responds with HTTP 422 and applies the same stacking 20% vote-weight penalty as the blocked-hostname check (`penalizeBlockedHostnameAttempt`).
