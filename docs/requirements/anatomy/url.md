# URL Anatomy

> A crawled web URL tracked as a first-class entity, linkable from posts and topic lists so related
> content can be discovered across the site.

## See Also

- [URL-Routable Entity Catalog](../ENTITIES.md) — helper and route details
- [Sources & Domains requirements](../content/SOURCES-DOMAINS.md)

## Data Model

DB table: `urls`

| Field         | Notes                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| `id`          | UUID                                                                       |
| `url`         | Full URL string                                                            |
| `hostname_id` | FK to `url_hostnames` (domain entity)                                      |
| `title`       | Page title — from the associated `crawls` row, not stored on `urls` itself |
| `description` | Page meta description — from the associated `crawls` row                   |

URL lives in the `(topics)/` route group but is **not** a topic type — it has its own DB table and
helper primitives. Referral URLs belong on the dedicated referral-links surface and are blocked from
being submitted as related links (enforced at the service layer).

## States

| State       | Condition                  | Behavior                                   |
| ----------- | -------------------------- | ------------------------------------------ |
| Crawled     | Crawl has run successfully | Title, description, and metadata available |
| Not crawled | Crawl pending or failed    | Raw URL only; metadata unavailable         |

## Surfaces

| Surface                        | Route / mechanism                                    |
| ------------------------------ | ---------------------------------------------------- |
| URL detail                     | `/url/:id`                                           |
| URL directory                  | `/urls`                                              |
| Post detail — Related Links    | Sidebar "Related Links" section on post detail pages |
| Community Lists — URLs         | `/communities/:slug/lists/urls`                      |
| User Links tab                 | `/user/:id/urls` (owner/admin only)                  |
| Post form — Related URLs field | Attached during post creation/edit                   |

## List-Item / Card Anatomy

| Element      | Shows                                                       | Visible when            |
| ------------ | ----------------------------------------------------------- | ----------------------- |
| Title        | Page title, linked to the URL detail page or the URL itself | When crawled            |
| Hostname     | Domain name with trust badge                                | Always                  |
| Domain badge | Color-coded trust badge from the hostname entity            | Always                  |
| Vote         | Entity-relation vote control                                | When an election exists |

The "Related Links" aside on post detail pages shows URLs attached to the post via
`post → related → url` entity relations.

## Detail Anatomy

The URL detail page (`/url/:id`) shows:

- Page title and external link to the original URL
- Hostname with domain trust badge
- Related posts — posts that have attached this URL as a related link
- Discussion links — discussion posts linked via `post → related → url` entity relations

## Actions

| Action                 | Who can act                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------- |
| View detail            | Signed-in users with `can_view_crawl_history`; signed-out users are redirected to login |
| Attach as related link | Signed-in users (on post or topic)                                                      |
| Remove related link    | Post author or admin                                                                    |
| Vote (entity relation) | Signed-in viewers                                                                       |
| Report hostname        | Signed-in viewers when the associated hostname exists and is not blocked                |

Reporting from URL detail, crawl history, or crawl detail submits the associated canonical
`hostname_id` as a `url_hostname` report. The URL UUID is never a moderation report target.

Referral URLs cannot be submitted as related links — the service layer rejects them and applies a
vote-weight penalty.

## Related

- [domain](./domain.md) — hostname trust badge shown on URL cards
- [post](./post.md) — posts that attach URLs as related links
- [source-item](./source-item.md) — RSS items whose article links resolve to these URLs
