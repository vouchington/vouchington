# Security Architecture reference

[Back to Security Architecture](SECURITY.md)

## Honeypot Fields

Hidden form fields that bots fill but humans never see. Implemented as a zero-friction bot detection layer.

### Forms with honeypot fields

- **Login / signup** (`web/components/auth/login-form.tsx`) — fields: `hp_website`, `hp_phone`
- **Post creation** (`web/components/posts/post-form.tsx`) — fields: `hp_website`, `hp_phone`

### Field rendering

```tsx
<div
  aria-hidden='true'
  style={{ position: 'absolute', left: '-9999px', opacity: 0, visibility: 'hidden' }}
>
  <Input
    name='hp_website'
    type='text'
    tabIndex={-1}
    autoComplete='off'
  />
  <Input
    name='hp_phone'
    type='text'
    tabIndex={-1}
    autoComplete='off'
  />
</div>
```

`display: none` is intentionally avoided — some bots skip those fields. `aria-hidden="true"` keeps them invisible to screen readers. Standard names like `website` and `phone` are intentionally avoided — browsers autofill those, which would block legitimate users.

### Backend behavior

| Route                                    | Honeypot response                           |
| ---------------------------------------- | ------------------------------------------- |
| `POST /api/v1/auth/email-address/tokens` | `200 { email_address: ... }` (fake success) |
| `POST /api/v1/auth/email-address/login`  | `401` (same as invalid token)               |
| `POST /api/v1/posts`                     | `201 { post: { id, ... } }` (fake success)  |

Detection is silent — bots never learn they were caught.

See [`backend/services/honeypot/README.md`](../../../backend/services/honeypot/README.md) for service documentation.

---

## Input Sanitization

- **SQL**: parameterized queries via `sql` template literals — no interpolation
- **LLM prompt injection**: `sanitizePromptInjection()` repeatedly decodes HTML entities under a bounded work budget, strips role-prefix/control-token attacks, and pairs with `wrapExternalContent()` from `@jongleberry/vurst-prompt` for all external content before passing it to LLM agents.
- **HTML/Markdown**: server-side sanitization via `markdown-it` in strict mode before raw HTML rendering
- **Domain blacklist**: profile markdown and profile links are validated against the domain blacklist before persisting. Any URL whose domain is blocked returns HTTP 400. Implemented in `backend/services/domain-blacklist-check/`.

---

## Link Attributes

All external links (`target='_blank'`) must use `rel='nofollow noopener noreferrer'`:

- `nofollow` — prevents passing PageRank to external sites (site-wide SEO policy)
- `noopener` — severs `window.opener` access, preventing reverse tab-napping
- `noreferrer` — omits `Referer` header and implies `noopener`

This applies to every `<a>` element that navigates away from the site, including:

- RSS feed item "Original" / "Read original" links
- RSS feed source URL links
- User homepage URL links
- Landing page profile links and referral links
- Any other user-supplied or external URLs rendered in the UI

---

## Images

`web/next.config.ts` sets `images.remotePatterns: []`, restricting `next/image` optimization to same-origin sources. Add entries to this list when external image domains are needed.

---

## Scraping Protection

Multiple layers reduce bulk data extraction by automated scrapers:

### Pagination Limits

Unauthenticated API requests are capped at 25 items per page (`ANON_MAX_LIMIT`). Authenticated requests may request up to 100 items/page. Applied via `clampAnonLimit()` from `@modules/search-utils` at the route handler level.

**Affected endpoints:** `/api/v1/posts`, `/api/v1/topics`, `/api/v1/rss-feed-items`, `/api/v1/trending-topics`, `/api/v1/hostnames`, `/api/v1/hostnames/top`, `/md/posts`, `/md/topics`

### robots.txt Directives

The following paths are disallowed for all crawlers (wildcard group and every explicitly named AI crawler):

- `/admin/`, `/api/`, `/auth/`, `/feed/`, `/login`, `/md/`, `/my/`

Major AI crawlers (`GPTBot`, `ClaudeBot`, `Google-Extended`, etc.) are listed explicitly so search engines recognize the site as welcoming AI indexing, but they inherit the same disallow list. No path is opened exclusively for AI crawlers.

**File:** `cloudflare-worker/src/robots-txt.mts`

### Progressive Rate Limiting (Planned)

Bot tier differentiation with progressive rate limiting at the CF Worker edge is tracked separately (see `radiant-napping-hartmanis.md` plan). It layers on top of the above measures.

---

## Production Checklist

Before deploying to production, verify:

- [ ] `PRODUCTION=true` set in CF Worker environment
- [ ] `CF_WORKER_SECRET` set in both CF Worker and backend, matching values (min 32 chars)
- [ ] `VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64` set on the backend
- [ ] `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64` set on the Cloudflare Worker
- [ ] `secure: true` cookie flag active (automatic when `NODE_ENV=production`)
- [ ] Verify **all subdomains** (including staging environments, mail servers, and third-party services sharing the TLD) are HTTPS-only **before** setting `PRODUCTION=true`. Once HSTS with `includeSubDomains` is cached by browsers, any non-HTTPS subdomain will become unreachable.
- [ ] HSTS preload (optional, irreversible): set `HSTS_PRELOAD=true` in CF Worker **only after** verifying no HTTP subdomains exist and the domain is ready for preload-list submission; then submit at <https://hstspreload.org>
- [ ] Verify `Content-Security-Policy` (enforcement, not report-only) is present on web page responses — set via `cloudflare-worker/src/csp.mts`; `script-src` must include a per-request nonce and must not include `unsafe-inline`
- [ ] Set `SENTRY_WEB_DSN` in the Worker environment and verify `connect-src` contains exactly its
      validated origin (not a wildcard); missing or invalid configuration omits the origin
- [ ] Verify `connect-src` uses the six exact legacy and dual-stack S3 image-upload origins required during the expand phase (not an `amazonaws.com` wildcard) — already pinned in `csp.mts`
- [ ] Set `CSP_ASSET_ORIGIN` in CF Worker production environment to the CloudFront distribution URL

## Related

- [Endpoint Migration recipe](../../../.agents/skills/agent-workflow/impact-recipes.md#endpoint-migration) —
  credential-shaped URL discovery and exact-host security review
- [Networking](../../overview/infrastructure/networking.md) — audited external API IPv6 support and direct-call decisions
- [Next.js CVE tracking](./SECURITY-NEXTJS-CVES.md) — patch floor, per-CVE status, and edge mitigation reference for Next.js advisories
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
