# Error Handling reference

[Back to Error Handling](error-handling.md)

## Error Response Contract

All error responses (from backend and CF Worker) follow this JSON shape:

```typescript
{
  message: string       // User-safe message, always present
  code?: string         // Machine-readable error code (e.g., "RATE_LIMIT", "NOT_FOUND")
  request_id?: string   // From x-request-id header, for admin debugging
  stack?: string        // Dev/test only, never in production
}
```

- `message` is always safe to display in toasts. Production 5xx: generic HTTP status text. 4xx: the developer-written message from `ctx.assert`/`ctx.throw`.
- `code` is optional. Web app branches on `code` (when present) or `status` (always). Never on `message`.
- `request_id` enables admin debugging without leaking internals.

## Error Code Registry

All common error codes are defined in `backend/modules/on-error/error-codes.mts`:

| Code                   | HTTP Status | Meaning                          |
| ---------------------- | ----------- | -------------------------------- |
| `AUTH_REQUIRED`        | 401         | Authentication required          |
| `FORBIDDEN`            | 403         | Authenticated but not authorized |
| `ACCOUNT_SUSPENDED`    | 403         | Account has been suspended       |
| `IDENTITY_REQUIRED`    | 403         | User has no username/OAuth link  |
| `INVALID_INPUT`        | 400/422     | Request validation failure       |
| `INVALID_CONTENT_TYPE` | 415         | Wrong `Content-Type` header      |
| `NOT_FOUND`            | 404         | Resource does not exist          |
| `CONFLICT`             | 409         | State conflict (duplicate, etc.) |
| `RATE_LIMIT`           | 429         | Rate limited                     |
| `INTERNAL_ERROR`       | 500         | Unexpected server error          |
| `BAD_GATEWAY`          | 502         | Upstream service failure         |
| `SERVICE_UNAVAILABLE`  | 503         | Service temporarily unavailable  |

Domain-specific services (crawler, email validation) keep their existing `.code` values on custom error classes. These flow through the error handler unchanged.

## Propagation Chain

```text
Backend service
  → ctx.throw(status, message) / ctx.assert(condition, status, message)
  → app.errorHandler() in backend/api/app.mts
  → JSON response { message, code?, request_id?, stack? }

Cloudflare Worker edge
  → edgeErrorResponse(status, message, code) in cloudflare-worker/src/error-response.mts
  → JSON response { message, code }

Web ApiError
  → web/lib/api/error.ts
  → error.message = backend's user-safe message
  → error.code = backend's code
  → error.requestId = x-request-id for debugging
```

Routes that catch errors to change the response shape, such as
[`GET /api/v1/auth/bluesky/callback`](../../../backend/api/v1/auth/README.md#get-apiv1authblueskycallback),
must still call `onError` from `@modules/on-error`. A user-facing 302 with `bluesky_error` does not
replace reporting: `onError` ignores 4xx and captures 5xx and unstatused failures.

## Security Policy

- **Production 5xx**: Generic HTTP status text only (`"Internal Server Error"`), with `code: "INTERNAL_ERROR"`. Never expose stack traces or internal error messages.
- **4xx**: The developer-written message is returned as-is (e.g., `"Post not found"`). Write messages that are safe to show users.
- **Stack traces**: Only included in dev/test environments via the `stack` field. Never in production.
- **Malformed errors**: `getErrorStatus()` defaults missing, invalid, or non-object errors to `500` so the handler can still emit a safe response.

## How to Add a New Error Code

1. Add the constant to `backend/modules/on-error/error-codes.mts`
2. Use it in your route/service via `ctx.throw(status, message, code)` or `createCodedError(status, message, code)`
3. If needed in the web app, import the constant as a string literal (no shared module between backend and web)

## Using Error Codes in the Backend

### In API routes

```typescript
import { NOT_FOUND } from '@modules/on-error/error-codes'

// Pass code as third argument to ctx.throw
ctx.throw(404, 'Post not found', NOT_FOUND)

// Or use ctx.assert with code
ctx.assert(post, 404, 'Post not found') // no code — acceptable for most 4xx
```

### In services

```typescript
import { createCodedError } from '@modules/on-error'
import { RATE_LIMIT } from '@modules/on-error/error-codes'

throw createCodedError(429, 'Rate limit exceeded', RATE_LIMIT)
```

## Expected API Errors (4xx Suppression)

All 4xx API responses are expected client errors — bad input, expired sessions, missing entities, rate limits. They are handled gracefully in the web app but can produce noisy `⨯ Error [ApiError]` console output when they propagate through Next.js's SSR pipeline (unhandled rejections, React error boundaries).

These errors are suppressed at two levels:

1. **`ApiError.digest`** — 401/403/404 errors use `NEXT_HTTP_ERROR_FALLBACK;{status}` to trigger Next.js's built-in error pages. Other 4xx errors use `EXPECTED_CLIENT_ERROR;{status}` so error boundaries can display status-specific messaging while Sentry ignores the noise.
2. **Sentry `ignoreErrors`** — `sentry.client.config.ts` ignores digests matching `/^EXPECTED_CLIENT_ERROR(?:;\d+)?$/`.

Sentry filtering uses `beforeSend` in `sentry.server.config.ts`, `sentry.client.config.ts`, and `sentry.edge.config.ts`. All three configs import `filterSentryEvent` from `web/lib/on-error/` (the same module that ships the [client-side `onError` handler](reference-error-handling-client-side-onerror-web-lib-on-error.md#client-side-onerror-weblibon-error)) so the suppression rules stay in one place.

Detection uses duck-typing via `isExpectedApiError()` in `web/lib/api/error.ts`, checking `name === 'ApiError'` and `status` is in range 400–499.
