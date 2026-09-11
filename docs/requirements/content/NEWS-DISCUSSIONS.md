# News Discussions

See also: [Entity × Action Matrix — rss_feed_item](../reference-rssfeeditem.md#rss_feed_item) · [Entity × Lifecycle Flow Matrix — rss_feed_item](../reference-rss-feed-items.md#rss-feed-items)

**Related code:** `web/app/news/page.tsx`, `web/components/news/news-filters.tsx`, `web/components/shared/topic-chip-filter.tsx`, `web/components/posts/post-list-page.tsx`, `web/components/posts/post-filters.tsx`
**Component rules:** [docs/requirements/navigation/COMPONENTS.md](../navigation/COMPONENTS.md) — Page Header, Search Input, and Topic Chip Filter primitives apply to these pages.

Links RSS feed item clusters to discussion posts via `post -> related -> url` entity relations.

## Behavior

### RSS Item Modal Detail

RSS feed item detail is rendered as a URL-addressable modal on top of news/feed/topic RSS item lists. The modal displays article content as sanitized HTML (links, bullet points, headings, etc.) and displays categories/topics as clickable badges. The backend sanitizes the best available HTML content field using `sanitizeRssHtml` before sending it to the frontend.

- `NewsItemClusterList` owns the modal navigation provider (`RssItemNavContext`).
- Opening an item adds `rss_item=<rss_feed_id:guid>` to the current URL.
- Lists also provide `rss_item_nav=<comma-separated composite ids>` so the modal can navigate to previous/next items in the current visible rendered order.
- The visible order includes every top-level visible RSS item card and expanded story-member card. Collapsed story members and hidden items are excluded until they become visible again.
- `rss_item_nav` should carry a bounded window around the current item from the currently visible list. Direct card links must not serialize invisible story members or the entire infinite-scroll list.
- Direct URLs without `rss_item_nav` still open the modal, but previous/next controls are disabled.
- All modal navigation uses `scroll: false` to prevent the underlying page from scrolling to top.
- `RssItemNavContext` also carries `hasNextPage`, `loadingMore`, and `loadMore` alongside `orderedItemIds`. When the user presses Next at the last loaded item and `hasNextPage` is true, the modal calls `loadMore()` and sets a `pendingAdvance` state; once new items appear in `orderedItemIds`, it auto-navigates to the first new item. Non-paginated providers (e.g. `UserRssFeedItemList`) pass the default no-op — prev/next simply stop at the last item.
- See [Source Item Anatomy — Detail Anatomy](../anatomy/source-item.md#detail-anatomy) for modal title treatment, header row composition, and action row element order (Previous/Vote/Save/Hide/Discuss/.../Next) including mobile collapse rules and Report placement.
- **HTML entities** in titles and text fallback content are decoded before display (e.g. `&#8217;` → `'`, `&#8230;` → `…`).
- Logged-in viewers can receive an additional "From People You Follow" RSS item module showing followed users whose latest trust choice is positive or negative for the item.
- If the viewer does not follow anyone with a positive or negative trust choice, the RSS item module must not render.
- When the viewer hides an item from inside the modal, the modal advances to the next item (or closes if the hidden item was the last).

### News Item Cards

See [Source Item Anatomy — List-Item / Card Anatomy](../anatomy/source-item.md#list-item--card-anatomy) for the card element breakdown (title, header row, snippet, action row, story cluster rendering, and official-source badge placement). Implementation rules for `web/components/feed/` live in [`web/components/feed/CLAUDE.md`](../../../web/components/feed/CLAUDE.md).

Layout contracts on `NewsItemCard`:

- The kebab is `absolute right-2 top-2` on the `relative` `<Card>` root with `pr-12` reserved on the title column. Do not place it in flow. It is the only Report control; Discuss lives in `NewsDiscussMenu` in the action row.
- Summary thumbnails require an excerpt, use `width={128} height={80}`, and take a pre-proxied `/sideload/` URL. Omit the thumbnail for `media_type === 'video'`.
- Header labels, action rows, and `CategoryChips` use `overflow-x-auto scrollbar-hide` with no `flex-wrap`.
- Actions `CardContent` uses `pt-0 pb-2`; video embed `CardContent` uses `pb-2 pt-0`.
- Every RSS list/detail response includes `rss_feed_item_embeds`, keyed by item ID. Cards and the
  modal select normalized embed text before Open Graph, Twitter, and existing RSS fields. Images
  use only `thumbnail_url` or the existing RSS sideload map; raw `meta_tags` remain data and never
  become image, link, or player sources.

- **Search row on `/news`**: a free-text `SearchInput` (sets `?q=` for text search) and a `TopicChipFilter` (sets `?topics=`) are rendered inline. Both params are forwarded to the backend: text via `websearch_to_tsquery`, topics via `topic_ids`. See `web/components/news/news-filters.tsx` and `web/components/shared/topic-chip-filter.tsx`.
- **Search and topic filter on `/discussions`** (and `/posts`, `/stories`): same `TopicChipFilter` is embedded in `PostFilters` via the `extraFilters` slot of `ListFilters`. The `?topics=` param is forwarded to `GET /api/v1/posts`.
- **Source links always resolve to `/latest`**: any link navigating to a source topic (`topic_type === 'rss_feed'`) — the source badge in `NewsItemHeader`, the podcast show page link in `PodcastListItem`, and the mini-player show-title link — uses `tab='latest'`, directing users to the source's own feed items (episodes/articles). Category `TopicLabel` chips inside `CategoryChips` still use `tab='news'` (items categorized under a topic, not source items).

### Category Display

Categories on RSS feed items are served from `relation__rss_feed_item__category__topic` (WHERE `votes_score_net > 0`, ordered by score DESC). The `view_rss_feed_items.categories` view:

- Returns topic-backed categories first (ranked by `votes_score_net` DESC), then appends free-text categories (`topic_id IS NULL` from `rss_feed_item_categories`) at the end.
- The initial `votes_score_net` for feed-mapped categories is 0.01 (written by the `rss-feed-categorizer` system user). The autotagger confirms genuinely relevant ones, raising their score to ~1.01.
- Categories with `votes_score_net <= 0` are excluded from the view.

`CategoryChips` always renders topic-backed chips before free-text chips client-side, regardless of the order the API returns. The API now returns categories pre-ranked (topic-backed first, then free-text) so this is normally a no-op, but the client guard remains as a safety net.

The **Manage Categories** action is available from the `...` kebab on both the news item card (`news-item-card.tsx`, which lives in `web/components/feed/`) and the modal footer (`news-item-actions.tsx`), keyed by `data-pw='manage-categories-menu-item'`. It opens a dialog reusing `ManageTagsContent` so users can add or vote on category-topic relations directly. RSS item management remains dialog-only and does not surface a full-page tags route.

### Hide

Each RSS feed item can be persistently hidden per viewer via the `relation__user__hide__rss_feed_item` predicate:

- Clicking the **Hide** button (`EyeOff` icon) calls `PUT /api/v1/bookmarks/rss_feed_item/:id/hide`.
- Clicking again (Unhide) calls `DELETE /api/v1/bookmarks/rss_feed_item/:id/hide`.
- On a successful hide, `HideButton` dispatches a `rss-item-hidden` CustomEvent (`{ detail: { id } }`) on `window`. List components listen for this event and immediately splice the item from the visible list (optimistic removal without a page reload).
- Hidden items are already filtered out of feed responses server-side via `backend/services/feeds/rss-feed-items/get-ids.mts`.
- The `bookmarks` field in the feed response (`Record<itemId, Record<predicate, boolean>>`) carries the viewer's current `hide` state so `HideButton` can render the correct initial active state without a separate fetch.

### Save

Each RSS feed item can be saved per viewer via the `relation__user__save__rss_feed_item` predicate:

- Clicking the **Save** button (`Bookmark` icon) calls `PUT /api/v1/bookmarks/rss_feed_item/:id/save`.
- Clicking again (Unsave) calls `DELETE /api/v1/bookmarks/rss_feed_item/:id/save`.
- No CustomEvent is dispatched — saving does not remove the item from the visible list.
- The `bookmarks` field in the feed response carries the viewer's current `save` state so `SaveButton` can render the correct initial active state without a separate fetch.

### Discussion Links

When an RSS feed item's URL has posts linked via `post -> related -> url` entity relations (with `votes_score_net > 0`), the linked posts appear as items inside the `NewsDiscussMenu` dropdown on the news card and modal footer.

### Discuss

See [news-story-clusters.md](./news-story-clusters.md) for the authoritative "Both" discussion model: per-item "Discuss" creates a link post; a cluster-level "Discuss the full story" CTA creates a story post via `POST /api/v1/stories/:storyId/discussions`. Discoverability gate and fallback behavior are documented there.

`NewsDiscussMenu` is the single dropdown rendered in the action row (and modal footer) for per-item Discuss. It lists, in order: linked posts (every entry in `relatedPosts`), a "Discuss" create action (`canDiscuss = isLoggedIn && !hasStoryPost && !!relatedUrlId`), then "Discuss with Community" (`canDiscussWithCommunity = isLoggedIn && (!!communityDiscussionTarget || viewerHasCommunity)`). `viewerHasCommunity` comes from `useViewerHasCommunity(isLoggedIn)`, which fetches `loadMyCommunities()` and caches the result at module scope for the session.

The trigger label reflects the linked-post count `n`: `0 → 'Discuss'`, `1 → '1 Post'`, `>1 → 'n Posts'`. The menu collapses when there's little to show: zero total actions renders nothing; a single `canDiscuss` action with no linked posts renders a plain button; a single linked post with neither Discuss action available renders a link straight to that post; otherwise it renders the full dropdown.

On `/communities/:slug/news` and its `/sources` and `/topics` filters, "Discuss" opens a verified
community discussion dialog and creates `post_type='discussion'` through
`POST /api/v1/communities/:slug/posts`, then links the visible news URL(s) with
`post -> related -> url` entity relations. Outside community news context, "Discuss with Community" appears inside the `NewsDiscussMenu`
dropdown (not the `...` kebab) for signed-in users who belong to at least one community;
that action opens a community selector and uses the same community-scoped creation path.

**Identity gate**: if the backend returns `IDENTITY_REQUIRED` (403) on any Discuss action — global
or community — the frontend **must never show a bare error toast**. Instead it opens
`UsernameRequiredDialog`. On `onUsernameSet`, it retries the original action automatically. This
applies to both `use-start-discussion-action.ts` (global Discuss) and
`NewsCommunityDiscussionAction` (community Discuss). For the community path, the Turnstile token
must **not** be reset on `IDENTITY_REQUIRED` because the backend checks identity before consuming
the captcha; resetting it would strand the retry with no token.

### Filtering

Both the feeds endpoint (`/api/v1/feeds/rss_feed_items/:feed_type`) and the search endpoint (`/api/v1/rss-feed-items`) support a `has_related_posts` query parameter (`'true'` or `'false'`) to filter items with or without linked discussion posts.

### Voting

RSS feed item cards display a `ScoreVote` semantic choice control with split positive/negative counts in an action row to the left of the Hide button, alongside the Discuss button. The control uses `submitRssFeedItemVote` (`PUT /api/v1/rss-feed-items/:id/vote`) and `DELETE` to Clear. It renders for signed-out users as login links (no `hideDownCount` — RSS items are non-UGC). Do not pass `hideDownCount` to `ScoreVote` on this surface.

### Share And Send

On news item cards, share actions are collapsed behind an overflow menu (`MoreHorizontal` icon) to reduce visual clutter. "Share with followers", "Send to followers", and "Report" appear in the dropdown. The "Report" option opens `ReportDialog` to submit a moderation report via `POST /api/v1/reports`; it is shown only to signed-in users. See [REPORTING.md](../moderation/REPORTING.md) for the full report spec.

News item cards expose the same follower distribution actions as posts:

- `Share with followers` creates feed-delivery events for the sender's current followers
- `Send to followers` creates notification events for all current followers or a selected subset
- selected recipients use cancellable, paginated server search, are capped at 100 distinct current followers, and reset when the viewer or item changes
- Web, Swift, and .NET expose these actions on RSS item cards and focused item detail, never on source/feed rows

Shared news rows are standalone feed items in personalized feeds:

- they render `Shared by @username` attribution
- they use the later of the share time and the RSS item's existing feed timestamp for ordering
- they do not get absorbed into story clustering
- users who follow the sender after the share do not receive the historical shared row

## Story Clustering

RSS feed items are grouped into **stories** — first-class entities that represent a single news event. The `@story-teller` agent decides whether to cluster using heuristics (rumors ≠ announcements, reviews ≠ launches).

- Items in the same story are deduplicated in feeds — one item shown per story (official or highest-voted)
- Each story can have one story post (`post_type='story'`), created by the `@story-teller` system user via API with auto-linked URLs and forwarded category topics. The post is linked via the `post__stories` junction table. Any user can initiate creation.
- The story-teller generates the post's `title` and `ai_summary_markdown` (no user-authored markdown)
- Feed responses include `story_id`, `stories` (with `published_at`), and `story_member_ids`
- `NewsItemCluster` renders as a single card with the story title in the header and member items as indented bare `NewsItemCard`s (no own card wrapper) separated by dividers. A story with no `title`/`published_at`/`cluster_reason` and zero `storyItems` collapses to a standalone `NewsItemCard` instead — the story card would otherwise show nothing beyond the lone item. Non-story items (no `story` prop) also render as a standalone `NewsItemCard`. See [Source Item Anatomy — List-Item / Card Anatomy](../anatomy/source-item.md#list-item--card-anatomy) for the header rendering table.
- See [stories.md](./stories.md) for full details

## Components

- `NewsItemHeader` — shared `[source badge] · Date · <category chips>` header row used in both list cards and the modal dialog header
- `NewsItemActions` — list-card row: `leadingAction | Vote | Save | Hide | Discussion | trailingAction`, with horizontal scrolling on narrow cards; Report never renders inline in the row — it lives only in the card's corner `...` kebab (`FollowerShareActions compact`). Modal-footer variant: vote (`data-pw='news-item-modal-vote'`, split-counts display) stays inline at all breakpoints. On mobile, discussion menus are inline and a single `FollowerShareActions` kebab (trigger `data-pw='rss-feed-item-modal-more-actions-button'`) holds Save/Hide/ManageCategories/Report via `menuLeadingItems`. On desktop, Save/Hide/Discuss are inline and a second `FollowerShareActions` kebab (trigger `data-pw='follower-share-more-actions-button'`) adds Share/Send/Report — mirroring the card's `...` kebab. The modal shell renders Previous/Next itself.
- `HideButton` — icon-only (`EyeOff`) toggle that calls the bookmark API with the `hide` predicate and dispatches `rss-item-hidden` on success
- `SaveButton` — icon-only (`Bookmark`/`BookmarkCheck`) toggle that calls the bookmark API with the `save` predicate; no CustomEvent dispatched
- `NewsItemCluster` — shows story title, same-level story item cards, per-item official badges inside card headers, per-item card footer action rows, and expandable related story members
- `NewsItemClusterList` — groups items by `story_id`, merges `stories`, `story_member_ids`, and `bookmarks` across pages; listens for `rss-item-hidden` to remove hidden items
- `NewsItemList` — same pattern for flat (non-clustered) topic news lists; also listens for `rss-item-hidden`
- `PostForm` — accepts `initialRelatedUrls` prop (URL chips + entity relations) and `initialDiscussionCategories` prop (optional pre-populated categories). The **Categories** field on the discussion create form is a multi-row `TopicAutocomplete` powered by `DiscussionFields`. Selecting categories writes `relation__post__category__topic` entity relations after the post is created (mirroring how data-point posts create category relations in `backend/services/posts/create.mts`). Categories are optional — the user can add, remove, or reorder rows before submitting.

## API Response Fields

Added to RSS feed item responses (auth-required for search endpoint):

- `related_posts_by_url_id: Record<string, string[]>` — url_id to up to five distinct post IDs, ranked by post ID descending
- `posts: Record<string, Post>` — hydrated posts (includes story-posts when present)
- `posts_metrics: Record<string, PostMetrics>` — post metrics
- `story_post_ids: Record<string, string>` — story_id to post_id mapping for stories that already have a story-post; used by `NewsItemCluster` to render the title link and filter the story-post from member Discussions rows
- `rss_feed_item_embeds: Record<string, UrlEmbed>` — item-keyed safe embed display and media
  projections; raw crawl metadata and oEmbed provenance are administrator-only
- personalized feed responses may also include `users` so shared-item attribution can render without a follow-up fetch

## Related

- [News component rules](../../../web/components/news/CLAUDE.md) — component-level implementation rules for `web/components/news/`
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
