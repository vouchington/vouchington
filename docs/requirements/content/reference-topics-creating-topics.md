# Topics reference

[Back to Topics](TOPICS.md)

## Creating Topics

Route: `/topics/create` (admin-only, gated by `requireAdmin()`)

Topics are created with minimal information:

- `name`
- `slug` (URL-safe, typically lowercase with hyphens, and unique among topics)
- `topic_type` (selected by the admin UI; omitted API payloads default to `topic`)
- `markdown`

The Topic Type selector uses the shared web topic type list from `web/types/topics.ts`. The same
list is reused by the admin edit page so newly supported web topic types appear in both places.

## Suggesting Topics

Routes:

- `/topic-recommendations` — signed-in recommendation queue for voting and review.
- `/topic-recommendations/create` — signed-in user flow for proposing a missing topic.
- `/topic-recommendations/:id/edit` — creator/admin edit flow while the recommendation is pending.

Signed-in users can reach the queue from the Topics sidebar and can start a proposal from the Write
dialog's **Suggest a Topic** action. Admins can also reach the queue from the CMS sidebar. Pending
recommendations can be edited by their creator or an admin; creators can withdraw their own pending
recommendations after confirming the action. Admins review pending recommendations from the queue and
approve or reject them there.

### Type Selector

The create form (`/topic-recommendations/create`) includes a **Topic Type** selector at the top.
Three types are offered to users:

| Type             | Value              | Conditional required field       |
| ---------------- | ------------------ | -------------------------------- |
| Topic (default)  | `topic`            | —                                |
| Referral Program | `referral_program` | Example Referral Link (URL)      |
| Card             | `card`             | Landing Page URLs (one per line) |

The type can be pre-seeded via `?type=referral_program` or `?type=card` in the URL. When a
`referral_program` or `card` type is selected, the corresponding conditional field becomes required
before submission. Admins can change the type inside the review dialog before approving.

On approval, the client navigates to the typed topic URL (e.g. `/referral-program/slug` for
`referral_program`, `/card/slug` for `card`) using `topicHref` from
`web/lib/links/entity-href.ts`.

## Editing Topics

Route: `/:topic-type/:idOrSlug/settings`

After creation, topics can be edited.

- Topic Type - after creation, a topic type can be set. Then, the form for updating specifics of that topic type is shown
- Spending Category - spending category information can be set for any topic type

## Managing Source

Route: `/:topic-type/:idOrSlug/settings/source`

Manage the RSS feed (source) for a topic.

- Create an RSS feed if none exists (title, RSS feed URL, home page URL)
- Update an existing RSS feed's title, RSS feed URL, and home page URL
- Enable or disable the RSS feed
- Force-refresh the RSS feed to fetch new items immediately
- Delete the RSS feed
- View feed metadata: enabled/disabled timestamps, last fetched, ETag, last modified
- View crawl history: timestamp and response code (color-coded) for recent crawls

Admins also manage topic domains from `/:topic-type/:idOrSlug/settings/domains`. Both source
and domain settings are available from the topic detail **Settings** dropdown when the viewer is an
administrator; **Source** is shown for `rss_feed` topics.

All topic detail pages show a **Topic Content** sidebar card when revision data can identify the
latest admin-authored content update. The date and user come from the latest `topic_revisions`
`create` or `update` row whose `changes` include `name` or `markdown`; non-content topic edits,
posts, data points, ratings, and RSS/news activity must not change this public attribution. Admin
authorship is based on the roles captured on the revision row when the change was written.

## Topic Detail Menubar

Topic detail Menubar items use counts from the topic detail entity payload, not probe calls to list endpoints.

- `Posts` item combines discussions, reviews, and data-points. Its count is the sum of `topic_metrics.count.discussions + count.reviews + count['data-points']`
- `Reviews` and `Data Points` items show individual post type counts separately (not nested under Posts)
- For all post-type items, logged-in viewers may receive `topic_metrics.viewer_count` data; the `+` indicator is shown when viewer-accessible count exceeds public count
- When the public count is `0` but the viewer can see restricted posts, the UI shows `0+`
- Post-type items are hidden only when both the public count and viewer-aware count are `0`
- The `Reviews` item is hidden when the topic's `allow_reviews` flag is `false` (see [Policy flags](reference-topics-topic-types.md#policy-flags))
- `Latest` item shows RSS feed items from feeds owned by this topic (source-based). Uses `topic_metrics.count.latest` which counts items from enabled feeds where `rss_feeds.topic_id` matches. `Latest` is always numeric-only and never shows `+`
- `News` item shows RSS feed items that have this topic tagged via category classification (via `rss_feed_item_categories.topic_id`). Uses `topic_metrics.count.news`. `News` is always numeric-only and never shows `+`
- Display order: Posts, Reviews, Data Points, Referral Links, Latest, News, Manage Tags
- When `isAdmin=true`, the MenuBar also shows a **Settings** dropdown. The dropdown links to
  `/:topic-type/:idOrSlug/settings/about`, `/:topic-type/:idOrSlug/settings/behavior`,
  `/:topic-type/:idOrSlug/settings/domains`, `/:topic-type/:idOrSlug/settings/aliases`, and
  `/:topic-type/:idOrSlug/settings/merge`; `rss_feed` topics also show
  `/:topic-type/:idOrSlug/settings/source`. These sub-pages replace the former flat topic
  management pages. See `web/components/topics/topic-detail-tabs.tsx`.
- When navigating to `/:topic-type/:id` without a subpage, redirect to the first non-empty Menubar item following the display order above; fall back to `posts` if all items are empty
- For authenticated viewers, the `Reviews` item should sort followed authors first by using the personalized `following_new` post sort; logged-out viewers stay on plain newest-first ordering.
- Topics that represent RSS feeds use the normal topic detail route; do not add a separate public RSS feed detail page.

## Contribute Aside

The `TopicActionsAside` on every topic detail page includes a **Contribute** section with quick-action links. Each link carries `?topic_id=<id>` so the destination create form pre-selects the current topic.

Visibility rules by topic type:

- **Write a Review** — hidden when the topic's `allow_reviews` flag is `false` (see [Policy flags](reference-topics-topic-types.md#policy-flags); topics with reviews disabled forbid review creation).
- **Share a Data Point** — visible only when `topic_type === 'card'` or `topic_type === 'bank_account'` (the only data-point-eligible types). When visible, the create form pre-seeds the correct vertical (`credit_card` or `bank_account`) and pre-selects the topic.
- **Start a Discussion** — always visible. The discussion create form shows a pre-populated **Categories** field with the current topic; on submit, `relation__post__category__topic` entity relations are created so the discussion appears on the topic's Posts tab.

See `docs/requirements/navigation/ACTIONS.md` for the full visibility/pre-fill matrix.

## Topic Import and Export

Authenticated users can import one topic name per line and export followed topics as JSON from
`/my/topics/import-export`. Web, SwiftUI, and .NET MAUI expose the same workflow with native client
surfaces. Topic import is synchronous; source import uses a separate asynchronous batch workflow.
See [Sources and Domains: Import/Export](SOURCES-DOMAINS.md#importexport) for the shared routes,
limits, export formats, and native monitoring contract.

## Topic trust signals

Topic pages expose a separate semantic trust-election signal.

- Topic detail pages show interactive Vouch, Like, Neutral, Dislike, and Disavow choices for signed-in users and read-only counts otherwise
- Topic cards and topic lists show read-only positive/negative counts alongside the existing star-rating summary
- Topic detail and list pages must use the consolidated topic payload for topic-election data; do not add extra browser fetches for election detail on initial page load
- Topic `sort=best` is driven by `topic_metrics.ratings__score__sort`, not alphabetical order
- Topic votes only influence the score buckets used for sort order:
  - Vouch, Like, Neutral, Dislike, and Disavow contribute ratings `5`, `4`, `3`, `2`, and `1` respectively
  - votes do not change displayed review-count buckets
  - votes do not change displayed topic-election counts or `votes_score_net`; the semantic choices remain raw vote aggregates
  - if a user has both a topic vote and a review rating, the review rating wins except a `3` review is overridden by the non-zero vote
- Backend requirement: every topic vote upsert must enqueue both topic-election stat refresh and topic rating-stat refresh, because topic `sort=best` depends on vote-influenced rating scores.
- Topic vote effects on `sort=best` are eventually consistent. The follow-up topic lookup for rating refresh may use normal replica-backed reads because the refresh path is debounce-oriented rather than strict read-after-write.
- Logged-in topic detail pages also show a compact "From People You Follow" module for:
  - followed users whose latest trust signal is positive
  - followed users whose latest trust signal is negative
  - followed users who follow the topic
- This module must be fetched asynchronously in React Server Components and omitted entirely for logged-out viewers.
- If none of those followed-user signals exist for the viewer, the module must not render at all.
