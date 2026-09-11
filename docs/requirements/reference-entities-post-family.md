# URL-Routable Entity Catalog reference

[Back to URL-Routable Entity Catalog](ENTITIES.md)

## Post family

Post types share the `/{post-type-slug}/{idOrSlug}` shape. `getPostSlugFromType`
(`web/lib/route-configs.ts`) maps `PostType` → URL slug. Use helpers from
`web/lib/post-helpers.ts` for the primary post path; tag sub-paths use
`postTagsHref` from `web/lib/links/entity-href.ts`.

| Entity     | URL shape(s)                       | Route dir            | Canonical helper                                 | Notes                                          |
| ---------- | ---------------------------------- | -------------------- | ------------------------------------------------ | ---------------------------------------------- |
| story      | `/story/[id]`, `/stories`          | `(posts)/story`      | `getCanonicalPostPath`, `getPostPath` (internal) | `post_type: 'story'`                           |
| review     | `/review/[id]`, `/reviews`         | `(posts)/review`     | `getCanonicalPostPath`, `getPostPath` (internal) | `post_type: 'review'`; tags via `postTagsHref` |
| discussion | `/discussion/[id]`, `/discussions` | `(posts)/discussion` | `getCanonicalPostPath`, `getPostPath` (internal) | `post_type: 'discussion'`                      |
| article    | `/article/[id]`, `/articles`       | `(posts)/article`    | `getCanonicalPostPath`, `getPostPath` (internal) | `post_type: 'article'`                         |
| blog post  | `/blog-post/[id]`, `/blog`         | `(posts)/blog-post`  | `getCanonicalPostPath`, `getPostPath` (internal) | `post_type: 'blog_post'`                       |
| data point | `/data-point/[id]`, `/data-points` | `(posts)/data-point` | `getCanonicalPostPath`, `getPostPath` (internal) | `post_type: 'data_point'`                      |

All helpers live in: `web/lib/post-helpers.ts`

---
