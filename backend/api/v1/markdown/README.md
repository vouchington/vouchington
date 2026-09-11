# Markdown API

Server-side markdown rendering for live preview in post and comment composers.

## Endpoints

| Method | Route                      | Authentication | Description                         |
| ------ | -------------------------- | -------------- | ----------------------------------- |
| POST   | `/api/v1/markdown/preview` | Required       | Render markdown to HTML for preview |

## POST /api/v1/markdown/preview

Renders the provided markdown string to HTML using the same `comrak`-based Rust pipeline as
published posts and comments. Mention resolution (`@user`, `#topic`, `!post`) is included.

**Always renders in non-admin mode** — admin raw HTML passthrough is excluded from previews for
simplicity. Admins will notice a small divergence between preview and final rendering for posts
that use raw HTML; this is documented and accepted.

### Request

```json
{
  "markdown": "# Hello\n\n@some-user is great."
}
```

- `markdown`: string, max 32 KB. Empty string returns `{ html: "" }`.

### Response

```json
{
  "html": "<h1>Hello</h1>\n<p><a href=\"/users/some-user\">@some-user</a> is great.</p>"
}
```

### Errors

| Status | Reason                                 |
| ------ | -------------------------------------- |
| 401    | Authentication required                |
| 413    | Markdown body exceeds 32 KB            |
| 415    | Content-Type is not `application/json` |
| 429    | Rate limit exceeded                    |

## Performance

| Endpoint                      | Round Trips                 | Caching | Notes                                              |
| ----------------------------- | --------------------------- | ------- | -------------------------------------------------- |
| POST /api/v1/markdown/preview | 1 auth + 1–N entity lookups | None    | Auth check; Rust comrak render; mention DB lookups |

Mention resolution performs one DB lookup per unique `@`/`#`/`!` handle in the markdown. For
typical preview inputs (< 32 KB, few mentions), total latency is under 10 ms.

## Related

- Service: [backend/services/markdown/README.md](../../../services/markdown/README.md)
- API routes: [backend/api/CLAUDE.md](../../CLAUDE.md)
- Backend conventions: [backend/CLAUDE.md](../../../../backend/CLAUDE.md)
