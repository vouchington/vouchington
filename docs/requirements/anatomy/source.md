# Source Anatomy

> An RSS feed or content source — a special topic type representing an individual blog, YouTube
> channel, podcast, or news publication that users can follow and review.

## See Also

- [Entity × Action Matrix — rss_feed](../reference-rssfeed.md#rss_feed)
- [Entity × Lifecycle Flow Matrix — sources](../reference-sources-rss-feeds.md#sources--rss-feeds)
- [Sources & Domains requirements](../content/SOURCES-DOMAINS.md)

## Data Model

A source is a topic with `topic_type = 'rss_feed'` plus a 1:1 extension row in `rss_feeds`.

**`topics` row (shared with all topic types):**

| Field        | Notes                                                            |
| ------------ | ---------------------------------------------------------------- |
| `id`         | UUID                                                             |
| `name`       | Raw stored value; never shown directly — use display-name helper |
| `slug`       | URL-safe slug; URL construction uses the helper                  |
| `topic_type` | Always `rss_feed`                                                |

**`rss_feeds` extension row:**

| Field             | Notes                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| `rss_feed_url_id` | FK to the `urls` row for the feed URL                                   |
| `home_page_url`   | Source homepage URL (resolved at service layer, not a direct DB column) |
| `feed_type`       | `article` \| `podcast` \| `video` \| `mixed`                            |
| `is_enabled`      | Whether crawling is active                                              |
| `topic_id`        | FK back to `topics.id`                                                  |
| `created_via`     | Immutable channel; see [provenance](../content/content-provenance.md)   |

**Display name** (never show raw `topics.name`):

| Condition                    | Label           |
| ---------------------------- | --------------- |
| Host is youtube.com/youtu.be | YouTube Channel |
| `feed_type = 'podcast'`      | Podcast         |
| `feed_type = 'video'`        | Video           |
| Default                      | News Source     |

URL slug for `rss_feed` topics is `source` (not `rss-feed`).

## States

| State    | Condition            | Behavior                             |
| -------- | -------------------- | ------------------------------------ |
| Active   | `is_enabled = true`  | Feed is actively crawled             |
| Disabled | `is_enabled = false` | Crawling paused; items still visible |

Sources also inherit topic lifecycle states (Active / Merged / Soft-deleted); see [topic.md](./topic.md#states).

## Surfaces

| Surface          | Route pattern                |
| ---------------- | ---------------------------- |
| Browse           | `/sources`                   |
| Detail root      | `/source/:idOrSlug`          |
| Detail subpage   | `/source/:idOrSlug/:tab`     |
| Settings (admin) | `/source/:idOrSlug/settings` |

## List-Item / Card Anatomy

| Element       | Shows                                                                                                  | Visible when             |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------ |
| Title         | Source display name, linked to its `/latest` tab                                                       | Always                   |
| Feed URL row  | Feed URL with parenthesized hostname link + external-link icon                                         | Always                   |
| Trust badge   | Domain trust badge (color-coded) or "Unrated" fallback linking to `/reviews`                           | Always                   |
| Vote buttons  | Vouch / Disavow controls for the **source topic** (`rss_feed` topic election, not the domain hostname) | Always                   |
| Follow button | Follow this source                                                                                     | Authenticated users only |

The topic-name badge is omitted — the title already links directly to the topic.

## Detail Anatomy

**Sidebar asides** (topic detail pages, in render order):

1. About card — description + "Updated on … by …" line
2. Referral CTA — logged-out viewers with `?referrer=` param
3. Sources — feed metadata and domain links
4. Actions — RSS feed link (always); Mute (logged-in only)
5. Related topics
6. Communities
7. FAQ posts (accordion)
8. Referral links — when source has a linked referral program
9. Admin tools — admin only

The **Subscribe to News** button (predicate `subscribe`) was removed from the UI (#6223); the backend relation remains active. See [ENTITY-ACTION-MATRIX.md — rss_feed](../reference-rssfeed.md#rss_feed) and [USER-RELATION-MATRIX.md — Notes](../users/USER-RELATION-MATRIX.md#notes).

## Actions

| Action                           | Who can act     |
| -------------------------------- | --------------- |
| Follow / Unfollow                | Signed-in users |
| Mute                             | Signed-in users |
| Vouch / Disavow (domain)         | Signed-in users |
| Submit source URL                | Signed-in users |
| Write a Review                   | Signed-in users |
| Start a Discussion               | Signed-in users |
| Edit / Toggle / Refresh / Delete | Admins          |

Muting a source implicitly removes any active follow on that entity.

## Related

- [topic](./topic.md) — base entity; sources inherit topic lifecycle and actions
- [source-item](./source-item.md) — individual items published by this source
- [domain](./domain.md) — hostname trust badge shown in source list rows
