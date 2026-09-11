# Authentication Overview reference

[Back to Authentication Overview](auth-overview.md)

## Server-Side Auth

`getCurrentUser()` (`web/lib/auth/get-current-user.ts`):

1. Reads `dt` and `st` from Next.js `cookies()`.
2. Base64-decodes the session JWT payload and checks for `uid`.
3. Fetches `GET /api/v1/auth/me` server-to-server (forwarding cookies) to get the full user object.
4. Wrapped in React `cache()` so it is called at most once per request.

Used by server components and pages that gate content on authentication.

## Edge Caching

The Cloudflare Worker verifies the app-issued `st` JWT signature to decide whether a request should
bypass cache. The verified payload now includes enrichment fields (`tt`, `rol`, `mpl`) for future
use in edge-level rate limiting and identity-aware caching. This is cache classification only;
the backend remains authoritative for auth.

## Anonymous Sessions

The web proxy automatically provisions a session for any visitor with no cookies (or invalid tokens). `PATCH /api/v1/session` with no `dt`/`st` generates a fresh device ID and anonymous session. This enables attribution tracking (e.g. referrer params) before login.
