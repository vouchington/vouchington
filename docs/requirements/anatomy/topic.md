# Topic Anatomy

> A knowledge entity representing a product, service, creator, organization, or concept that users
> can review, follow, discuss, and rate.

## See Also

- [Entity × Action Matrix — topic](../reference-topic.md#topic)
- [Entity × Lifecycle Flow Matrix — topics](../reference-topics.md#topics)
- [Topics requirements](../content/TOPICS.md)

## Data Model

| Field                  | Notes                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| `id`                   | UUID                                                                  |
| `name`                 | Display name (raw stored value; surfaces use the display-name helper) |
| `slug`                 | URL-safe identifier; URL construction always uses the helper          |
| `topic_type`           | Enum; drives routing, extension table, and type-specific UI           |
| `markdown`             | Admin-authored description                                            |
| `noindex`              | When true, topic pages emit noindex robots metadata                   |
| `allow_reviews`        | When false, blocks review creation and hides review UI                |
| `deleted_at`           | Non-null when soft-deleted                                            |
| `merged_into_topic_id` | Non-null when merged into another topic                               |

**Topic types** (8 total; each maps to a distinct URL slug):

| `topic_type`             | URL slug                 |
| ------------------------ | ------------------------ |
| `topic`                  | `topic`                  |
| `rewards_program`        | `rewards-program`        |
| `referral_program`       | `referral-program`       |
| `card`                   | `card`                   |
| `rewards_program_status` | `rewards-program-status` |
| `bank_account`           | `bank-account`           |
| `rss_feed`               | `source`                 |
| `fediverse_instance`     | `instance`               |

`rss_feed` topics are described separately in [source.md](./source.md); `fediverse_instance` topics
are described separately in [fediverse-instance.md](./fediverse-instance.md).

## States

| State        | Predicate                                                 | Behavior                                      |
| ------------ | --------------------------------------------------------- | --------------------------------------------- |
| Active       | `deleted_at IS NULL AND merged_into_topic_id IS NULL`     | Normal visible topic                          |
| Merged       | `merged_into_topic_id IS NOT NULL AND deleted_at IS NULL` | Alias/redirect; content stays in place        |
| Soft-deleted | `deleted_at IS NOT NULL`                                  | Hidden; can be revived by upsert on slug/name |

Merge is one level deep (chains are prevented at the service layer). Hard-delete is intentionally
unsupported — use merge instead.

## Surfaces

| Surface                   | Route pattern                        |
| ------------------------- | ------------------------------------ |
| Browse (generic topics)   | `/topics`                            |
| Browse (typed collection) | `/:topicTypeSlug` (e.g., `/cards`)   |
| Detail                    | `/:topicTypeSlug/:idOrSlug`          |
| Detail subpages           | `/:topicTypeSlug/:idOrSlug/:tab`     |
| Settings (admin)          | `/:topicTypeSlug/:idOrSlug/settings` |

## List-Item / Card Anatomy

| Element        | Shows                                                          | Visible when           |
| -------------- | -------------------------------------------------------------- | ---------------------- |
| Avatar         | First letter of topic name                                     | Always                 |
| Type badge     | Humanized `topic_type` label; unknown values use generic Topic | Always                 |
| Description    | First two lines of `markdown` (clamped)                        | When `markdown` is set |
| Rating         | Star summary                                                   | When reviews exist     |
| Review count   | Number of reviews                                              | When reviews exist     |
| Follower count | Number of followers                                            | When followers exist   |

## Detail Anatomy

**Menubar** (display order, items hidden when count is 0 unless currently active):

| Item           | Count source                                | Visibility condition                      |
| -------------- | ------------------------------------------- | ----------------------------------------- |
| Posts          | Sum of discussions + reviews + data-points  | When count > 0 (or current page)          |
| Reviews        | `topic_metrics.count.reviews`               | When count > 0 and `allow_reviews = true` |
| Data Points    | `topic_metrics.count['data-points']`        | When count > 0                            |
| Referral Links | —                                           | When topic has a referral program         |
| Latest         | `topic_metrics.count.latest` (source items) | RSS feed topics only; always numeric      |
| News           | `topic_metrics.count.news` (tagged items)   | Always numeric, never shows `+`           |
| Manage Tags    | —                                           | Always (logged-in users)                  |
| Settings       | —                                           | Admin only                                |

**Contribute aside** (quick-action links, each pre-seeded with `?topic_id=<id>`):

| Action             | Visible when                                               |
| ------------------ | ---------------------------------------------------------- |
| Write a Review     | `allow_reviews = true`                                     |
| Share a Data Point | `topic_type === 'card'` or `topic_type === 'bank_account'` |
| Start a Discussion | Always                                                     |

**Sidebar asides** (topic detail pages, in render order):

1. About card — description + "Updated on … by …" line
2. Referral CTA — logged-out viewers with `?referrer=` param
3. Sources — RSS feeds and domain links
4. Actions — RSS feed link, Subscribe/Mute/Contribute (logged-in)
5. Related topics
6. Communities
7. FAQ posts (accordion)
8. Referral links — when topic has a referral program
9. Admin tools — admin only

## Actions

| Action             | Who can act                              |
| ------------------ | ---------------------------------------- |
| Follow / Unfollow  | Signed-in users                          |
| Vouch / Disavow    | Signed-in users                          |
| Mute               | Signed-in users                          |
| Write a Review     | Signed-in users (`allow_reviews = true`) |
| Share a Data Point | Signed-in users (eligible types only)    |
| Start a Discussion | Signed-in users                          |
| Edit settings      | Admins                                   |
| Merge / Alias      | Admins                                   |
| Soft-delete        | Admins                                   |

Signed-out users clicking vote/follow/join/comment CTAs are redirected to `/login?next=…`.

## Related

- [source](./source.md) — `rss_feed` topic type (content sources)
- [fediverse-instance](./fediverse-instance.md) — `fediverse_instance` topic type (instance directory)
- [post](./post.md) — reviews, discussions, and data points targeting topics
- [referral-link](./referral-link.md) — referral links on referral-program topics
- [community](./community.md) — communities that list this topic
