# Error Handling reference

[Back to Error Handling](error-handling.md)

## Server-Side Error Boundaries

When a server-side API call throws an `ApiError` with a non-recoverable status (anything other than 401 from `getCurrentUser()`, or specific codes handled via `returnNullForMissingEntity()`), the error propagates through the React tree until an error boundary catches it.

### Error boundary hierarchy

| Boundary           | File                       | Catches                                        | UI                                                    |
| ------------------ | -------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `global-error.tsx` | `web/app/global-error.tsx` | Root layout errors (e.g., `auth/me` 429)       | Full-page; replaces root layout (own `<html>/<body>`) |
| `error.tsx`        | `web/app/error.tsx`        | Route-segment errors (page-level API failures) | In-shell; sidebar/navbar still visible                |

### `getCurrentUser()` error contract

`getCurrentUser()` returns `null` only for 401 responses (the user is not signed in). All other errors — including 429, 500, and network failures — propagate so the appropriate error boundary can display a styled page instead of silently treating the user as signed out.

Critical route data that determines the document status must be awaited before any `loading.tsx` or
`Suspense` fallback can start streaming. This includes `getCurrentUser()`, `getTopic()`, and other
main entity/detail queries. Once streaming starts, Next.js can no longer change the HTTP status, so
optional RSC panels should degrade locally while main route queries must propagate 401/403/404/5xx
before the response body is committed.

Nullable server entity helpers use `returnNullForMissingEntity()`, which defaults to 404-only. A
main route helper must not collapse 403 into `null`, because that turns a backend forbidden response
into a page-level 404. Optional panels may pass `nullStatusCodes: [403, 404]` locally when they
intentionally degrade after the main entity has already loaded.

### Digest encoding

`ApiError` encodes the HTTP status in its `digest` so error boundaries can display status-specific messaging without access to the original error object (which Next.js strips for security):

| Pattern                          | Triggered by                         | Handled by                       |
| -------------------------------- | ------------------------------------ | -------------------------------- |
| `NEXT_HTTP_ERROR_FALLBACK;401`   | `ApiError(…, 401)`                   | `unauthorized.tsx`               |
| `NEXT_HTTP_ERROR_FALLBACK;403`   | `ApiError(…, 403)`                   | `forbidden.tsx`                  |
| `NEXT_HTTP_ERROR_FALLBACK;404`   | `ApiError(…, 404)`                   | `not-found.tsx`                  |
| `EXPECTED_CLIENT_ERROR;{status}` | `ApiError(…, 400/408/409/422/429/…)` | `error.tsx` / `global-error.tsx` |
| _(no digest)_                    | 5xx `ApiError` or unknown `Error`    | `error.tsx` / `global-error.tsx` |

Use `parseErrorDigest(error.digest)` from `@/lib/api/error-helpers` to extract `{ status, title, description }` in error boundary components. It returns `null` for unrecognized digests (5xx, unknown errors), which map to generic "Something went wrong" copy.
