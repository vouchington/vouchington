# Source Stories

A **source story** (news cluster) is a group of related RSS feed items (1 primary + N related members) sharing the same news event, clustered by the `@story-teller` agent. Key fields: `story.id`, `story.title`, `story.cluster_reason`, `story.published_at`, `story.official_rss_feed_item_id`.

See [stories.md](stories.md) for the `stories` table schema and clustering algorithm.

## Discussion Model ("Both" paths)

Source stories support two independent discussion paths:

### Per-item "Discuss" (link post)

Available on every item row in the cluster:

- Calls `createLinkPost(url.id)` → `POST /api/v1/posts` with `post_type='link'`
- No LLM, no discoverability gate
- Redirects to the new link post at `/<post_type_slug>/<slug>`

See [NEWS-DISCUSSIONS.md](NEWS-DISCUSSIONS.md) for per-item Discuss details.

### Cluster "Discuss the full story" (story post)

A CTA at the cluster header level, visible when: **logged in** AND **no existing story post** AND **`storyItems.length >= 1`** (i.e. ≥2 cluster members total, since `storyItems` excludes the primary).

- Calls `POST /api/v1/stories/:storyId/discussions`
- Triggers `@story-teller` LLM to generate `title` and `ai_summary_markdown`
- Creates `post_type='story'` post and redirects to `/<post_type_slug>/<slug>`
- **On 403 `FEED_NOT_DISCOVERABLE`**: falls back to `createLinkPost(primary.url.id)` and redirects to the resulting link post
- **On 409** (story already has a post): calls `router.refresh()` so the title link appears

| Action                         | Endpoint                                    | Post type | LLM                   |
| ------------------------------ | ------------------------------------------- | --------- | --------------------- |
| Per-item Discuss               | `POST /api/v1/posts`                        | `link`    | No                    |
| Cluster Discuss the full story | `POST /api/v1/stories/:storyId/discussions` | `story`   | Yes (`@story-teller`) |

## Cluster Header Rendering

See [Source Item Anatomy — List-Item / Card Anatomy](../anatomy/source-item.md#list-item--card-anatomy) for the cluster header rendering table (story title treatment and CTA visibility by condition).

## Component Rules

See [web/components/news/CLAUDE.md](../../../web/components/news/CLAUDE.md) for component-level implementation rules.

## Related

- Story schema and clustering: [stories.md](stories.md)
- Per-item Discuss and news card behavior: [NEWS-DISCUSSIONS.md](NEWS-DISCUSSIONS.md)
- Component rules: [web/components/news/CLAUDE.md](../../../web/components/news/CLAUDE.md)
