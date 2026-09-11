# Source Item Anatomy

> An individual item published by an RSS feed source — an article, podcast episode, or video —
> that users can vote on, save, hide, and discuss.

## See Also

- [Entity × Action Matrix — rss_feed_item](../reference-rssfeeditem.md#rss_feed_item)
- [Entity × Lifecycle Flow Matrix — rss_feed_item](../reference-rss-feed-items.md#rss-feed-items)
- [News & Discussions requirements](../content/NEWS-DISCUSSIONS.md)
- [Source Stories requirements](../content/news-story-clusters.md)
- [Backend RSS feed item contract](../../../backend/services/rss-feed-items/README.md)

## Data Model

| Field              | Notes                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| `id`               | UUID                                                                      |
| `rss_feed_sources` | FK via `rss_feed_item_sources` join table — which feeds contain this item |
| `title`            | Article/episode title (HTML entities decoded before display)              |
| `url_id`           | FK to the canonical URL for the item's original article                   |
| `published_at`     | Publication timestamp from the feed                                       |
| `story_id`         | Non-null when the item belongs to a story cluster                         |

Identity and content are stored separately. The unpartitioned `rss_feed_item_ids` table maps the
feed-domain natural key `(url_hostname_id, guid)` to a permanent UUIDv7 `id`. The partitioned
`rss_feed_items` table stores content and shares that `id` as its primary key and foreign key to the
identity row. This preserves one item when multiple feeds on the same hostname publish the same
GUID; `rss_feed_item_sources` remains the independent N:M provenance edge.

Items are URL-addressable via the `?rss_item=<uuid>` query parameter on any feed or topic news page,
where the value is the `rss_feed_item.id` UUID. `?rss_item_nav=<comma-separated uuids>` provides a
bounded nav window for Previous/Next.

## Topic Sources

The category chips shown in the card and detail anatomies (below) draw from three additive
topic-relation sources that stack rather than replace one another — adding one does not remove or
gate another:

1. **Category mapping** — feed-declared categories mapped to topics; pre-existing, always runs.
2. **Discoverable-source LLM pass** — the [autotagger agent](../../../backend/agents/autotagger/README.md) (`autotagger` system user) adds topics for items from discoverable sources.
3. **Paid-follower collaborative pass** — a no-LLM pass that adds topics favored by the item's plus/pro-plan followers, reusing the same system user and `relation__rss_feed_item__category__topic` table as category mapping.

See the autotagger README and [TAGS.md](../content/TAGS.md#manual-tag-add-limit) for the full mechanics and per-tier caps.

## States

| State        | Condition                                           | Behavior                                                    |
| ------------ | --------------------------------------------------- | ----------------------------------------------------------- |
| Normal       | Not hidden, not saved                               | Visible in feeds                                            |
| Hidden       | Viewer has hidden the item                          | Removed from the viewer's feed (optimistic removal)         |
| Saved        | Viewer has saved the item                           | Accessible from viewer's saved items; not removed from feed |
| Story member | `story_id` is non-null                              | Rendered inside a cluster card rather than standalone       |
| Official     | `story.official_rss_feed_item_id` matches this item | Renders an "official source" badge inside the cluster       |

## Surfaces

| Surface            | Route / mechanism                          |
| ------------------ | ------------------------------------------ |
| Global news feed   | `/news`                                    |
| Topic news tab     | `/:topicType/:id/news`                     |
| Community news tab | `/communities/:slug/news`                  |
| Personalized feed  | `/feed/news/*`                             |
| Modal detail       | `?rss_item=<id>` overlaid on any news list |

## List-Item / Card Anatomy

**Standalone item card:**

| Element        | Shows                                                                | Visible when                                                           |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Title          | External link to original article URL (`target=_blank`)              | Always                                                                 |
| Source badge   | Source name, linked to the source topic page                         | Always                                                                 |
| Date           | Publication timestamp                                                | Always                                                                 |
| Category chips | Outline badges for category topics; links to topic page when matched | When categories exist                                                  |
| Snippet        | Plain text summary (HTML stripped)                                   | When snippet is available                                              |
| Show more      | Opens the modal detail                                               | Always                                                                 |
| Vote           | Up/down arrows; renders as login links for signed-out viewers        | Always                                                                 |
| Save           | Bookmark toggle                                                      | Signed-in viewers only                                                 |
| Hide           | Hides item from viewer's feed                                        | Signed-in viewers only                                                 |
| Discuss        | Opens discussion creation                                            | Always                                                                 |
| Report         | Opens report dialog                                                  | Signed-in viewers; `...` kebab only — never a standalone inline button |

The action row scrolls horizontally on narrow viewports instead of wrapping.

**Story cluster card** (when `story_id` is set):

The cluster wraps all member items under a shared header:

| Header element                  | Shows                                  | Visible when                                               |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Story title                     | Link to the story post                 | Story post exists                                          |
| Story title                     | Plain text                             | No story post                                              |
| "Discuss the full story" button | CTA to create a story-level discussion | No story post, viewer is logged in, cluster has ≥2 members |

Each member item inside the cluster has its own `Show more | Vote | Hide | Discuss` action footer.
The official-source badge renders inside that member item's header area (not in the story wrapper).
When a story post exists, it is filtered out of every member's Discussions row — the story title
link serves as the canonical entry point.

## Detail Anatomy

The modal detail opens on top of any news list page without navigating away.

| Element                    | Shows                                                                               | Visible when                                  |
| -------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| Title                      | Clickable external link to original article URL; no separate "Read original" button | Always                                        |
| Source badge               | Same as card header                                                                 | Always                                        |
| Date                       | Publication timestamp                                                               | Always                                        |
| Category chips             | Same as card header                                                                 | When categories exist                         |
| Body                       | Sanitized HTML content (links, bullets, headings)                                   | When content is available                     |
| Previous                   | Navigate to previous item in nav window; icon-only on mobile                        | When `rss_item_nav` is set                    |
| Vote                       | Up/down; inline at all breakpoints                                                  | Always                                        |
| Save                       | Bookmark toggle; inline at `sm+`                                                    | Signed-in viewers; `sm+` inline, mobile `...` |
| Hide                       | Hides item; modal advances to next item (or closes if last)                         | Signed-in viewers; `sm+` inline, mobile `...` |
| Discuss / discussion links | Opens discussion or shows linked discussions                                        | `sm+` inline, mobile `...`                    |
| Share / Send               | Share with followers or send to followers                                           | Signed-in; `...` overflow only                |
| Report                     | Opens report dialog; `...` overflow only — never a standalone inline button         | Signed-in; `...` only                         |
| Next                       | Navigate to next item in nav window; icon-only on mobile                            | When `rss_item_nav` is set                    |
| "From People You Follow"   | Friends who left positive or negative signals for this item                         | Logged-in viewer follows anyone who voted     |

Discussion links are accessible for signed-out viewers on desktop (`sm+` inline) but not via the
mobile `...` menu (which requires authentication to render).

## Actions

| Action               | Who can act                                  |
| -------------------- | -------------------------------------------- |
| Vote (up/down)       | All viewers (login links when signed-out)    |
| Save / Unsave        | Signed-in viewers                            |
| Hide / Unhide        | Signed-in viewers                            |
| Discuss              | All viewers (links to login when signed-out) |
| Share with followers | Signed-in viewers                            |
| Send to followers    | Signed-in viewers                            |
| Report               | Signed-in viewers                            |
| Manage Categories    | Signed-in viewers                            |

## Related

- [source](./source.md) — the feed that publishes these items
- [post](./post.md) — discussion posts linked to items via `post → related → url`
- [url](./url.md) — the canonical URL entity for each item's article link
