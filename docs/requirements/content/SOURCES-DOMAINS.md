# Sources & Domains

See also: [Entity × Action Matrix — rss_feed](../reference-rssfeed.md#rss_feed) · [Entity × Action Matrix — domain](../reference-domain.md#domain) · [Entity × Lifecycle Flow Matrix — sources](../reference-sources-rss-feeds.md#sources--rss-feeds)

## Public Discovery

- `/sources` is the public RSS-feed-first directory.
- `/domains` is the public domain directory.
- `/domain/:idOrHostname` is the public domain detail route.
- Sources topic filtering uses the shared combined `Search by text or #topic` field with hashtag
  autocomplete (`web/components/shared/hashtag-search-input.tsx`), consistent with the news, posts,
  and topics list pages. Multiple `#topic` tokens are combined with AND semantics (feeds must belong
  to all specified topics).

## Data Model

- Every RSS feed belongs to exactly one topic.
- Topic homepage/domain authority is derived from the topic-linked hostname.
- Topic pages surface sources and domains for the current topic plus descendant topics.

## Social Actions

- Topics expose follow, mute, semantic trust choices, and review entry points.
- RSS feeds expose follow and mute state. The `subscribe` backend relation is active but the Subscribe to News UI has been removed (#6223).
- Domains expose semantic trust choices backed by hostname elections.
- Muting a topic or RSS feed implicitly removes any active follow on that entity. See [docs/overview/architecture/bookmarks.md](../../overview/architecture/bookmarks.md#implicit-unfollow) for the full implicit-unfollow rules.

## Domain Trust Badges

See [Domain Anatomy — States](../anatomy/domain.md#states) for the four-tier trust badge scheme
(trusted / neutral / distrusted / unrated) and threshold conditions.

Badges appear on domain cards (domains list, domain detail, sources list, and compare page) and in
the Most Trusted Domains home section. Users can cast semantic trust choices on domains to adjust their trust
status.

## Home Page Sections

The home page includes two new discovery sections:

- **Most Trusted Domains**: Domains with at least one positive community trust signal (`votes_count_up > 0`), ordered by API net vote score. Helps users discover reputable sources quickly.
- **Trending Feeds**: RSS feeds ranked by recent activity (follows, items) with a configurable time range (day/week/month). Helps users discover growing, actively-followed feeds.

Logged-out users receive fully resolved SSR. Logged-in users receive the sections streamed asynchronously so they do not delay the primary page content.

## Domain Comparison

- Route: `/domains/compare?ids=id1,id2[,id3,...]`
- Compare up to 10 domains side-by-side
- Useful for evaluating source credibility or feed quality before following

See [Domain Anatomy — List-Item / Card Anatomy](../anatomy/domain.md#list-item--card-anatomy) for
the displayed fields (hostname, trust badge, vote counts).

## Rendering

- Personalized topic/feed friend activity should remain in React Server Components.
- Logged-out users should get fully resolved SSR.
- Logged-in users can stream social proof sections without delaying the primary page content.

## Source List Item Layout

See [Source Anatomy — List-Item / Card Anatomy](../anatomy/source.md#list-item--card-anatomy).

## Native Client Parity

Web, Swift, and .NET all expose native News Sources surfaces for article feeds:

| Client | News source surfaces                         | Follow actions                                                                          |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Web    | `/news-sources`, `/my/news-sources`          | Follow/unfollow RSS feed and follow/unfollow the linked topic.                          |
| Swift  | News → Your Sources / All Sources            | `SourcesListView` uses `feed_type=article` and exposes Source and Topic follow buttons. |
| .NET   | News page scopes: Your sources / All sources | `ApiNewsFeedService` uses `feed_type=article` and exposes source/topic follow commands. |

Podcast and video source surfaces reuse the same native source-list patterns with
`feed_type=podcast` and `feed_type=video`.

Domains and URLs are native Web Search surfaces on Swift and .NET:

| Surface | Swift                                                                                                   | .NET                                                                                                    | API contract                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Domains | Browse/detail with hostname trust badges, trust, mute/block, and Turnstile-backed report actions        | Browse/detail under Web Search with trust, mute/block, and Turnstile-backed report actions              | `/api/v1/hostnames`, `/api/v1/hostnames/:idOrHostname`, `/api/v1/hostnames/:id/vote`, `url_hostname` bookmarks, `/api/v1/reports` |
| URLs    | Auth-gated detail/crawl routes report the associated hostname and expose capability-gated crawl actions | Auth-gated detail/crawl routes report the associated hostname and expose capability-gated crawl actions | `/api/v1/urls`, `/api/v1/urls/:id`, `/api/v1/urls/:id/crawls`, `/api/v1/urls/:id/crawls/:crawlId`, `/api/v1/urls/:id/crawl`       |

The domain action model is trust vote, mute, block, and report. Native report UI obtains a fresh
`cf_turnstile_response` token for each submission or retry. URL and crawl routes submit the
associated canonical hostname UUID as `url_hostname`. There is no domain-follow relation; follow
behavior remains on topics and RSS feeds.

## Navigation and Breadcrumbs

Source detail pages (`/source/<slug>/*`) derive breadcrumb category and sidebar intent from `feed_type` (video → Channels/Videos, podcast → Podcasts/Podcasts, article/mixed → News Sources/News). Domain pages (`/domain/<host>`) resolve to the Web Search intent. See [NAVIGATION.md § Content-aware intent override](../navigation/reference-navigation-route-intent-resolution.md#content-aware-intent-override-source-detail-pages) for the full matrix and implementation details.

## Source Submission

The `/sources` page hosts a **Submit Source** button that opens `SubmitSourceDialog` — a modal with a single URL field:

- **One URL** — calls `POST /api/v1/rss-feeds` (`createSource`), navigates to the topic page on success
- **Invalid feed** — backend returns a 422; error is shown inline in the modal
- **Always follows** — `follow: true` is hardcoded; there is no opt-out

Bulk URL/OPML import is handled by the per-content-type import/export pages (see below).

## Import/Export

Intent-scoped import/export pages under `/my/` expose the same contract on web, SwiftUI, and .NET
MAUI. Web routes share `web/components/my/import-export/import-export-page.tsx`; native clients use
platform-native editors, file pickers, progress presentation, and share sheets rather than a web
view or browser fallback.

| Route                            | Content type | `feedType` prop |
| -------------------------------- | ------------ | --------------- |
| `/my/sources/import-export`      | All Sources  | `'all'`         |
| `/my/news-sources/import-export` | Articles     | `'article'`     |
| `/my/podcasts/import-export`     | Podcasts     | `'podcast'`     |
| `/my/channels/import-export`     | Videos       | `'video'`       |
| `/my/topics/import-export`       | Topics       | `'topics'`      |

### Export

- **Source-type dropdown** (All Sources / News Sources / Podcasts / Channels): visible on all source-type pages; controls the `feed_type` query parameter on `GET /api/v1/my/export/rss-feeds`. Initial value equals the page's `feedType`. Not shown for topics.
- **Export OPML** button: downloads followed sources as OPML (`text/xml`).
- **Export CSV** button: downloads followed sources as CSV (`text/csv`), adding `&format=csv` to the export query.
- **Topics** export as JSON only (no dropdown, no CSV).
- Native export writes a temporary file and presents the platform share sheet. The route selects the
  initial source filter, but users can change it before exporting.

### Import

- Import is never type-restricted — any RSS feed URL or file can be imported regardless of the selected type in the dropdown.
- **URL list**: paste feed URLs (one per line); submitted via `POST /api/v1/my/import/rss-feeds` with the `urls` field.
- **File upload** (`.opml`, `.xml`, `.csv`): OPML/XML files submitted with the `opml` field; CSV files submitted with the `csv` field.
- Every source import request sends `follow: true`, accepts at most 500 rows, and must fit within the
  2 MiB encoded JSON request-body limit. Topic import accepts one topic name per line and exports JSON.
- All bulk source imports are async (queued via `POST /api/v1/my/import/rss-feeds`); topics import is synchronous.

Native clients poll one source-import batch sequentially. **Stop monitoring** cancels only local
polling; it does not cancel server work. Resume and retry continue polling the same batch. Clients
ignore stale responses whose batch identity or counters regress, and do not treat inactivity as a
timeout. Monitoring state is not restored after app termination.

Accessible from the intent sidebars (requires auth).

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions
- [My API import/export contract](../../../backend/api/v1/my/reference-post-api-v1-my-import-rss-feeds.md)
- [User import/export service](../../../backend/services/user-import-export/README.md)
- [Native client architecture](../../overview/architecture/native-clients.md)

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
