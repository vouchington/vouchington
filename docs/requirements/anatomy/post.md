# Post Anatomy

> User-created content — reviews, discussions, data points, articles, and more — that can be voted
> on, commented on, shared, and linked to topics.

## See Also

- [Entity × Action Matrix — post](../reference-post.md#post)
- [Entity × Lifecycle Flow Matrix — posts](../reference-posts.md#posts)
- [Posts requirements](../content/POSTS.md)

## Data Model

| Field              | Notes                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | UUID                                                                                                                                          |
| `title`            | Optional; fallback label is "Untitled {PostType}"                                                                                             |
| `markdown`         | Body content                                                                                                                                  |
| `post_type`        | Enum (see table below)                                                                                                                        |
| `clearance_status` | Moderation state: approved / pending / rejected / in_review                                                                                   |
| `approved_at`      | Current derived approval timestamp; mutually exclusive with rejection/review                                                                  |
| `rejected_at`      | Current derived rejection timestamp                                                                                                           |
| `in_review_at`     | Current derived staff-review timestamp                                                                                                        |
| `broadcast`        | Feed visibility: `everyone` \| `users` \| `followers` \| `mutual_followers`                                                                   |
| `privacy`          | URL visibility: `public` \| `private`                                                                                                         |
| `is_anonymous`     | Hides author from everyone except creator and admins                                                                                          |
| `archived_at`      | Non-null when archived (hidden from listings, reachable by URL)                                                                               |
| `community_id`     | Non-null for community-scoped posts                                                                                                           |
| `created_by_id`    | Creator; null for system-generated posts                                                                                                      |
| `created_via`      | Immutable channel of the writing request; `system` for story posts, article sync and jobs; see [provenance](../content/content-provenance.md) |

**Post types:**

| `post_type`            | Label                | Badge color |
| ---------------------- | -------------------- | ----------- |
| `review`               | Review               | Amber       |
| `discussion`           | Discussion           | Blue        |
| `data_point`           | Data Point           | Purple      |
| `comment`              | Comment              | Gray        |
| `topic_recommendation` | Topic Recommendation | Emerald     |
| `story`                | Story                | —           |
| `article`              | Article              | —           |
| `blog_post`            | Blog Post            | —           |
| `link`                 | Link                 | —           |

`article` and `blog_post` are admin-created only. `topic_recommendation` is managed through the
dedicated recommendation workflow, not the generic post composer.

**Broadcast rules:**

- `broadcast='everyone'` must always use `privacy='public'`.
- Comments always inherit `everyone`/`public`.
- Private posts are completely hidden (no placeholder) from unauthorized viewers.
- Any post that is not `everyone` + `public` must be rendered with `noindex, nofollow`.

## States

| State     | Condition                                              | Viewer sees                                                                                        |
| --------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Approved  | `clearance_status = approved`, privacy/broadcast match | Full content                                                                                       |
| Pending   | `clearance_status = pending`                           | Author and admin only — full content                                                               |
| In Review | `clearance_status = in_review`                         | Staff review; content visible to author and staff                                                  |
| Rejected  | `clearance_status = rejected`                          | Author: removal notice; staff: "under review" badge + content; others: unavailable notice          |
| Archived  | `archived_at IS NOT NULL`                              | Hidden from listings; accessible by direct URL                                                     |
| Anonymous | `is_anonymous = true`                                  | Author hidden from everyone except creator and admins; does not appear on creator's public profile |

For a root review, archive state may be an automatic, provenance-backed succession epoch. Only a
newer publicly eligible review by the same author with the same exact nonempty topic set can create
that epoch; see [Review succession](../content/reference-post-lifecycle-review-succession.md).

## Surfaces

| Surface         | Route pattern                                      |
| --------------- | -------------------------------------------------- |
| Type listing    | `/reviews`, `/discussions`, `/data-points`, etc.   |
| Global listing  | `/posts`                                           |
| Post detail     | `/:postTypeSlug/:idOrSlug`                         |
| Post edit       | `/:postTypeSlug/:idOrSlug/edit`                    |
| Topic posts tab | `/:topicType/:id/posts` (and reviews, data-points) |
| Community posts | `/communities/:slug/posts`                         |

## List-Item / Card Anatomy

| Element         | Shows                                                              | Visible when                                                                       |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Post type badge | Humanized type label, color-coded (see table above)                | Always                                                                             |
| Review rating   | Star display (e.g. ★★★★☆)                                          | Review posts only                                                                  |
| Category badges | Up to 5 category topic chips (outline variant)                     | When categories exist                                                              |
| Share actions   | Share/Send to followers                                            | Signed-in, not creator, top-level, public post                                     |
| Title           | Post title or fallback                                             | Always                                                                             |
| Body preview    | Markdown preview with heading demotion (no page-level h1 conflict) | Always                                                                             |
| Author          | Username link — **no avatar on cards**                             | When not anonymous                                                                 |
| Timestamp       | Relative post age                                                  | Always                                                                             |
| Vote            | Semantic choice control; hides negative count from non-members     | When post has an election                                                          |
| Comment count   | Number of top-level comments                                       | When comments exist                                                                |
| Save            | Bookmark toggle                                                    | Signed-in viewers                                                                  |
| Hide            | Hides from viewer's feed                                           | Signed-in viewers                                                                  |
| Broadcast badge | Audience indicator (followers / signed-in / mutual)                | Only for `followers`/`users`/`mutual_followers` broadcast — **not** for `everyone` |
| Report          | Opens report dialog; `...` overflow only                           | Signed-in, non-author viewers                                                      |

The label row (`[PostType] [Rating] [Categories] … [Share]`) uses a single-line horizontal scroll;
share actions are pushed right with `ml-auto`.

## Detail Anatomy

Post detail renders all post types through one shared layout. Element order:

1. **Title** — `h1`; fallback "Untitled {PostType}" when blank
2. **Badge strip** — post-type badge + review ratings (review only) + category badges + "Referral"
   badge (when any rated topic has a referral program) + share actions pushed right
3. **Review star ratings** — full star-rating rows (review posts only)
4. **Data point metadata** — card/issuer, credit score, spend (data_point posts only)
5. **Author metadata** — avatar + "Posted by" byline; rendered **below the markdown body,
   immediately above the action bar** (not at the top)
6. **Images** — displayed above the body; clicking opens a fullscreen lightbox
7. **Body** — rendered markdown / HTML
8. **Action bar** — horizontal vote control, Subscribe (logged-in), and post actions; comment
   counts do not appear in the post body / action row — they appear in the Comments tab label
9. **Referral program links** — card showing links to each reviewed topic's referral program
   (review posts only)

**Sidebar asides** (post detail, in render order):

1. Post author card
2. Follow context — "From People You Follow" with positive/negative signals
3. Referral links — review posts whose topics have a referral program
4. Categories — related topic tags
5. Related posts
6. Related links — related URLs attached to the post
7. Contribute CTA — logged-in viewers only

## Actions

| Action               | Who can act                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| Vote (up/down)       | Signed-in viewers; login links when signed-out                           |
| Save / Unsave        | Signed-in viewers                                                        |
| Hide / Unhide        | Signed-in viewers                                                        |
| Subscribe            | Signed-in viewers                                                        |
| Share with followers | Signed-in, non-creator, top-level, public posts                          |
| Send to followers    | Signed-in, non-creator, top-level, public posts                          |
| Report               | Signed-in non-authors only — never on your own content, never signed-out |
| Edit                 | Author (within 24 h) or admin (no time window)                           |
| Delete               | Author or admin                                                          |
| Archive / Unarchive  | Author or admin (from edit form Advanced section)                        |
| Comment              | Signed-in viewers (login prompt when signed-out)                         |

Vote control only renders when the post has an election/score. Signed-out users clicking vote/follow/join/comment CTAs are redirected to `/login?next=…`.

## Related

- [topic](./topic.md) — topics a review or discussion is linked to
- [referral-link](./referral-link.md) — referral links shown on review posts
- [source-item](./source-item.md) — discussion posts can be linked to RSS items via related URLs
- [url](./url.md) — related URLs attached to posts
