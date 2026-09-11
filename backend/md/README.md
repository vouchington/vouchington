# Markdown Content Routes (`/md/`)

Serves public content as structured markdown for LLM consumption and programmatic access.

All responses use `Content-Type: text/markdown; charset=utf-8` with YAML frontmatter.

## Routes

| Method | Route                     | Description                            |
| ------ | ------------------------- | -------------------------------------- |
| `GET`  | `/md/posts`               | List public posts (paginated)          |
| `GET`  | `/md/posts/:idOrSlug`     | Single post with raw markdown body     |
| `GET`  | `/md/topics`              | List topics (paginated)                |
| `GET`  | `/md/topics/:idOrSlug`    | Single topic with raw markdown body    |
| `GET`  | `/md/users/:idOrUsername` | Public user profile (no listing route) |

## Query Parameters

### Posts (`/md/posts`)

| Param        | Description                                          |
| ------------ | ---------------------------------------------------- |
| `post_types` | Filter by type: `discussion`, `review`, `data_point` |
| `topic`      | Filter by topic slug or ID                           |
| `limit`      | Results per page (1-100, default 25)                 |
| `after`      | Pagination cursor                                    |

### Topics (`/md/topics`)

| Param         | Description                                                                             |
| ------------- | --------------------------------------------------------------------------------------- |
| `topic_types` | Filter by type: `rewards_program`, `card`, `referral_program`, `rewards_program_status` |
| `limit`       | Results per page (1-100, default 25)                                                    |
| `after`       | Pagination cursor                                                                       |

## Response Format

### Detail Pages

```yaml
---
title: 'Post Title'
url: https://voucha.ai/discussion/post-slug
post_type: discussion
created_at: 2026-03-13T10:30:00.000Z
updated_at: 2026-03-13T12:00:00.000Z
slug: post-slug
---
# Post Title

Raw markdown body here.
```

### List Pages

```yaml
---
has_next_page: true
end_cursor: eyJpZCI6Ii4uLiJ9
start_cursor: eyJpZCI6Ii4uLiJ9
---

## [Post Title](https://voucha.ai/discussion/post-slug)

- **Type**: discussion
- **Created**: 2026-03-13T10:30:00.000Z
- **Comments**: 5
```

## Caching

Routes set `Cache-Control: public` headers with the following max-age values:

- **List endpoints** (`/md/posts`, `/md/topics`): `max-age=60` (1 minute)
- **Detail endpoints** (`/md/posts/:idOrSlug`, `/md/topics/:idOrSlug`, `/md/users/:idOrUsername`): `max-age=300` (5 minutes)

The CF Worker caches responses at the edge (30s anon, 24h bot). No auth is required.

Responses also include an `ETag` header (quoted SHA-256 digest, base64url-encoded). Clients can send `If-None-Match: "<etag>"` on subsequent requests (with the quoted value exactly as received from the `ETag` response header); the server returns `304 Not Modified` when the content is unchanged, saving bandwidth.

### Detail Lookup Contract

Detail routes must resolve request identifiers through the lookup caches before fetching entity
payloads. `/md/posts/:idOrSlug` resolves id, slug, or alias-like post slugs with
`getPostIdByAnyCached()`, then fetches the canonical post UUID with `getPostByAnyCached()`.
`/md/topics/:idOrSlug` resolves id, slug, merged-source slug, or topic alias with
`getTopicIdByAnyCached()`, then fetches the canonical topic UUID with `getTopicByAnyCached()`.

Visibility and type constraints run only after the canonical entity fetch. Public slug routes must
not bypass this chain with direct uncached entity fetches because these endpoints are advertised to
machines and can receive crawler traffic.

## Privacy

- No user listing endpoint exists (`/md/users` returns 404)
- Machine-readable discovery surfaces may advertise these routes only as public unauthenticated resources.

### Visibility Matrix

| Entity | Case                                                                                                             | Markdown behavior                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Post   | `privacy='public'`, `broadcast='everyone'`, approved, direct post, positive unweighted vote count, active author | Listed and detail route returns `200`         |
| Post   | `deleted_at IS NOT NULL`                                                                                         | Hidden from lists; detail route returns `404` |
| Post   | `archived_at IS NOT NULL`                                                                                        | Hidden from lists; detail route returns `404` |
| Post   | `post_type='comment'`                                                                                            | Hidden from lists; detail route returns `404` |
| Post   | `privacy!='public'`                                                                                              | Hidden from lists; detail route returns `404` |
| Post   | `broadcast!='everyone'`                                                                                          | Hidden from lists; detail route returns `404` |
| Post   | `clearance_status!='approved'`                                                                                   | Hidden from lists; detail route returns `404` |
| Post   | Author has `suspended_at IS NOT NULL`                                                                            | Hidden from lists; detail route returns `404` |
| Post   | `votes_count_up - votes_count_down <= 0`                                                                         | Hidden from lists; detail route returns `404` |
| Topic  | `noindex=false` and active                                                                                       | Listed and detail route returns `200`         |
| Topic  | `deleted_at IS NOT NULL`                                                                                         | Hidden from lists; detail route returns `404` |
| Topic  | `merged_into_topic_id IS NOT NULL`                                                                               | Resolved through canonical topic lookup       |
| Topic  | `noindex=true`                                                                                                   | Hidden from lists; detail route returns `404` |

## Related

- LLM discovery: `/llms.txt` (served inline by CF Worker)
- CF Worker routing: [cloudflare-worker/README.md](../../cloudflare-worker/README.md)
