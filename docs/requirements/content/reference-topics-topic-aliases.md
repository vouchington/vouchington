# Topics reference

[Back to Topics](TOPICS.md)

## Topic Aliases

Topics can set aliases.

### Searching Topic Aliases

Route: `/topics/aliases` (admin-only, gated by `requireAdmin()`)

Search topic names, slugs, and aliases.
Returns the top results in pairs of `<Topic> - <Topic Alias>`.
Submitting the search must use client-side App Router navigation, not native GET form submission, so the URL updates without a full document reload.
When clicking a result, goes to the topic's Settings → Aliases page.
No pagination required - just show the top 24 results.

### Editing Topic Aliases

Route: `/:topic-type/:idOrSlug/settings/aliases`

Allows adding or removing aliases for a topic.
Allow adding multiple aliases at once.
An alias already linked to another topic is rejected. To move one, unlink it first, then link it to the destination topic by alias ID.

### Hashtag aliases

`topic_aliases` is also the canonical hashtag dictionary. An alias may be unlinked
(`topic_id IS NULL`) while it is accumulating content, then linked to exactly one topic by an
administrator. A topic may have any number of linked hashtag aliases. Linking and unlinking write
actor-backed entity-relation revisions; unlinking a hashtag preserves the dictionary row so its
history and aggregate remain addressable.

Hashtag grammar is enforced by the shared application normalizer, not a database constraint:

- an optional leading `#` is accepted;
- canonical keys contain ASCII alphanumeric segments separated by `-`;
- search and autocomplete translate `.` and `_` to `-`, collapse repeated separators, and compare
  lowercase keys;
- authored casing is retained on source occurrences for display selection.

Every active topic slug has a linked system alias. Changing a slug links the new slug while retaining
the old slug as an alias; a slug cannot claim an alias linked to another topic. Topic deletion and
merge flows preserve or move aliases according to the same ownership invariant.

Posts and RSS items store hashtag categorization as positive `category -> topic_alias` relations.
When a linked hashtag is used as a list filter, it expands to direct category relations for the topic
plus all positive hashtag-alias relations linked to that topic. An unlinked hashtag matches only its
exact alias relation. Multiple hashtag filters use AND semantics; unknown valid hashtags return an
empty result rather than falling back to text search.

**Membership vs. authorship.** A post's current hashtag-alias membership is the
`relation__post__category__topic_alias` row alone: `relation.deleted_at IS NULL AND
relation.votes_score_net > 0`, joined to `topic_aliases`. `post_topic_alias_sources` records a
different, narrower fact — which contributor attached the hashtag via which authored token
(title/markdown/explicit) — and is written by a structurally independent path from the relation's
vote score: `replacePostHashtagSources` (`backend/services/posts/hashtag-sources.mts`) recomputes
source rows synchronously on every edit, while `votes_score_net` is only recomputed by the queued,
per-actor `finalizePostHashtagCategoryVotes` (`backend/services/posts/hashtag-votes.mts`). No
constraint or shared transaction ties the two together, and the codebase does not assume they
agree: `retainTopicAliasPublicationPostImpacts`
(`backend/services/post-publication/capture-topic-alias.mts`) computes a topic alias's affected
posts as the union of posts with a source row and posts with an active positive relation, because
either can exist without the other. This is not a one-off: every impact/invalidation fan-out (cache
invalidation, publication capture, reconciliation candidates, retained topic keys, projection
identity) enumerates the same alias union — source row ∪ positive relation — because an
under-enumerated fan-out silently stops invalidating, re-publishing, or re-projecting a post. Test
membership with the relation predicate alone; only use `post_topic_alias_sources` where the
question is actually about authorship, or (as in the community mute check on an unfinalized post)
there is no vote score yet to test.

### Merging Topic Aliases

Route: `/:topic-type/:idOrSlug/settings/merge`

Admins can merge a source topic into a destination topic as an alias/redirect operation. The workflow
is also available from the topic detail Settings dropdown.

- Destination selection uses topic autocomplete and excludes the source topic.
- Confirmation requires typing the source topic name.
- Submit calls `POST /api/v1/topics/:sourceIdOrSlug/merges` with `destination_id_or_slug`.
- The source topic's aliases move to the destination, and the source slug becomes a destination alias.
- The source topic is marked as merged; source IDs, slugs, and aliases resolve to the destination.
- Public source-topic routes redirect to the canonical destination topic route.
- Posts, follows, RSS feeds, ratings, topic relations, and community list items are not moved by this workflow.

Topic deletion is intentionally unsupported. Admins should merge topic aliases instead of deleting topics.

## Source Display Name

`topics.name` for `topic_type='rss_feed'` stores the full feed URL for uniqueness,
e.g. `Level1Techs (https://www.youtube.com/feeds/videos.xml?channel_id=...)`.

**UI requirement**: Never show the raw stored name on source pages. All display surfaces
must route through `getTopicDisplayName(topic, { feedType? })` from `web/lib/topics/display-name.ts`.

**Label vocabulary** (in priority order):

1. URL host is `youtube.com` or `youtu.be` → **"YouTube Channel"**
2. `feed_type === 'podcast'` → **"Podcast"**
3. `feed_type === 'video'` → **"Video"**
4. Default → **"News Source"**

**SEO `<title>`/JSON-LD**: use `getTopicDisplayTitle(topic)` — title only, no kind label.

**Identity surfaces** (settings form, merge confirm) keep raw `topic.name` — they need
the exact stored value for matching/submission.

## RSS Feed (Source) Topics

RSS feed topics represent individual content sources (blogs, YouTube channels, podcast feeds, etc.) and serve as the primary rateable entities for individual content creators.

**Type designation:**

- Topics with `topic_type = rss_feed` represent individual content sources (the blog, channel, or feed itself)
- `rss_feed` topics may have a parent relationship to the owning topic (via `relation__topic__parent__topic`); the parent is an ordinary `topic` unless it qualifies for a more specific surviving type
- Exception: official organizational feeds (e.g., Apple newsroom, OpenAI blog) may be direct children of the owning `topic` without an additional intermediate relationship

**Primary rateable entities:**

- `rss_feed` topics are the primary entities for ratings, discussions, and reviews
- Parent `topic` rows that exist only as reference targets should be minimal and used as parents, not as direct rateable entities
- User-generated content (discussions, reviews, ratings) targets `rss_feed` topics, not their parent topics

**Routing and discovery:**

- `/sources` page displays ALL RSS feed topics regardless of their parent's topic type
- `/source/<id-or-slug>` is the canonical URL route for `rss_feed` type topics — `source` is the URL slug for the `rss_feed` topic type
- Topic detail pages use the `/<topic-type-slug>/<id>` route pattern for all topic types (e.g. `/card/<id>`, `/rewards-program/<id>`, `/source/<id>` for RSS feeds)

**Creating and managing RSS feeds:**

- RSS feeds are created and updated via the admin UI at `/:topic-type/:idOrSlug/settings/source`
- See [Managing Source](reference-topics-creating-topics.md#managing-source) for details on RSS feed lifecycle operations

## Topic Categories

Categories are special topics that classify other reviewable topics for structured data and Google Review Snippets.

**Category relationship:**

- Categories are linked to topics via `topic -> category -> topic` entity relations
- Categories are admin-seeded via database migration (not the admin seed script)
- Parent-child category hierarchy is supported (e.g., "Software Products" is a child of "Products")

**Structured data:**

- Topic review pages include `AggregateRating` JSON-LD when ratings exist
- A topic's category slug determines its schema.org `@type` (e.g., `books` → `Book`, `movies` → `Movie`)
- Post review pages use the reviewed topic's category to set `itemReviewed.@type` (e.g., a review of a Book has `itemReviewed: { @type: 'Book', ... }`)

**Canonical categories:**
The system includes 20 canonical categories (seeded via migration):

- Voucha, Books, Courses, Events, Local Businesses, Movies, Products, Software Products, Hardware Products, Recipes
- Creative Work Seasons, TV Show Seasons, Creative Work Series, TV Shows, Creative Work Episodes, TV Show Episodes
- Games, Songs, Playlists, Organizations

**Category slug → schema.org type mapping** is maintained in `web/lib/seo/schema-org-types.ts`.

## Topic Lifecycle States

Topics exist in exactly one of three states:

| State            | Predicate                                                 | Meaning                                                 |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| **Active**       | `deleted_at IS NULL AND merged_into_topic_id IS NULL`     | Normal visible topic                                    |
| **Merged**       | `merged_into_topic_id IS NOT NULL AND deleted_at IS NULL` | Alias/redirect to another topic; content stays in place |
| **Soft-deleted** | `deleted_at IS NOT NULL`                                  | Hidden; can be revived by upsert if slug/name matches   |

These states are mutually exclusive. Topic hard-delete is intentionally unsupported — use merge instead (see [ENTITY-LIFECYCLE-MATRIX.md](../ENTITY-LIFECYCLE-MATRIX.md)). Merge is one level deep; chains are prevented by a service-layer assertion in [backend/services/topics/merge-aliases.mts](../../../backend/services/topics/merge-aliases.mts). `merged_into_topic_id` uses `ON DELETE RESTRICT`, preventing deletion of merge destinations while sources still point to them.

### Active-topic filter

Any raw query on the `topics` table that should return only visible topics **must** include both clauses:

```sql
WHERE t.deleted_at IS NULL
  AND t.merged_into_topic_id IS NULL
```

The canonical views (`view_topics`, `view_embedded_topics` in [backend/data-stores/psql/views/2025-02-01-topics.sql](../../../backend/data-stores/psql/views/2025-02-01-topics.sql)) and the search query builder ([backend/services/topics/search/query-builder-where.mts](../../../backend/services/topics/search/query-builder-where.mts)) already apply both filters. Direct table queries must add them manually.

`ON DELETE RESTRICT` on `topic_aliases.topic_id` prevents a hard delete while aliases still reference the topic. Soft-deleted topics retain their aliases for redirect lookup.

## Related

- [Web topic display-name rules](../../../web/lib/topics/CLAUDE.md) — scoped implementation invariants
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
