# Error Handling reference

[Back to Error Handling](error-handling.md)

## Client-Side `onError` (`web/lib/on-error/`)

Mirrors `backend/modules/on-error/` so the contract reads the same on both sides of the stack. Every client-side mutation or interaction that can fail funnels through this module — callers never call `toast.error` / `toast.success` / `Sentry.captureException` directly.

```typescript
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess } from '@/lib/on-error'

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  setSubmitting(true)
  try {
    await createPost(payload)
    onSuccess('Post created')
    router.push(`/posts/${id}`)
  } catch (err) {
    if (err instanceof ApiError && err.code === 'IDENTITY_REQUIRED') {
      setUsernameDialogOpen(true)
      return
    }
    onError(err, { fallback: 'Failed to create post', tags: { form: 'post-create' } })
    setSubmitting(false)
  }
}
```

- `onError(err, { fallback, tags?, extra?, skipSentry? })` — shows a toast (rate-limit message, `ApiError.message`, or `fallback`) and forwards unexpected errors to Sentry. 4xx `ApiError` instances are toasted but not captured.
- `onSuccess(message, options?)` — Sonner success toast. Pass `description` for an additional detail line.
- Branch on precondition codes (`IDENTITY_REQUIRED`, `MFA_REAUTH_REQUIRED`, etc.) above the `onError` call so they continue to open action-oriented modals — see [Precondition Errors and Action-Oriented Modals](reference-error-handling-precondition-errors-and-action-oriented-modals.md#precondition-errors-and-action-oriented-modals).
- `skipSentry: true` suppresses Sentry capture even for unexpected errors. Use it for known-expected business outcomes that surface as plain `Error` (not `ApiError`): client-side validation rejections (e.g. invalid UUID before hitting the API), user-cancelled WebAuthn prompts (`NotAllowedError`), and wrapper errors like `PostSavedWithRatingError` where the underlying cause has already been reported elsewhere. Do **not** use `skipSentry` to hide real failures.
- `scrubSentryError(event, hint)` — filters expected errors first, then scrubs request URLs,
  credential headers, and cookies from every non-null error event across client, server, and edge.
- `scrubSentrySpan(span)` / `scrubSentryTransaction(event, hint)` — apply the same request-metadata
  contract to span attributes, breadcrumb data, and the Sentry Request Interface. See
  [Sentry request-metadata scrubbing](../../requirements/security/reference-security-observability-scrubbing.md).

### Routing rules

| Interaction kind                                                                            | Calls                                                    |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Mutation (POST/PUT/PATCH/DELETE, upload, send, confirm-destructive)                         | `onSuccess` on success **and** `onError` in `catch`      |
| Non-mutation interaction that can fail (search/filter `router.push`, action-backed fetches) | `onError` in `catch` only — the UI is the success signal |
| Pure UI affordance with no failure mode                                                     | Neither                                                  |

**Rules:**

- Use `error.status` or `error.code` to branch on error type
- Use `error.message` or `getApiErrorMessage()` for display — it already contains the backend's user-safe message
- Never match on `error.message` strings in conditional logic

## Admin Debugging with request_id

The `request_id` field in error responses matches the `x-request-id` header set by the Cloudflare Worker. Use it to correlate:

- CF Worker logs
- Backend request logs
- Sentry errors (search by `request_id` tag)

Commands, log group names, and Logs Insights queries live in
[Deployed Error Investigation](../../operations/deployed-error-investigation.md).

Backend `onError()` copies the edge `x-request-id` into structured console diagnostics and Sentry
tags when request client context is available. This keeps backend 5xx captures searchable by the
same `request_id` returned in the JSON error response without logging request headers or bodies.

## Cloudflare Worker Edge Errors

All edge-level error responses use `edgeErrorResponse()`:

```typescript
import { edgeErrorResponse } from './error-response.mts'

return edgeErrorResponse(502, 'Bad Gateway', 'BAD_GATEWAY')
return edgeErrorResponse(429, 'Too Many Requests', 'RATE_LIMIT', { 'retry-after': '60' })
```

The CF Worker does not have access to backend error codes. Use string literals that mirror the backend registry.
Edge-generated failures and forwarded origin failures with status 4xx/5xx are stamped with
`Cache-Control: no-store, max-age=0, must-revalidate`, `CDN-Cache-Control: no-store`, and
`Cloudflare-CDN-Cache-Control: no-store`. The Worker cache still only writes successful 2xx
responses, but these headers are a defensive signal to every shared cache in front of or behind the
Worker.

The Sentry tunnel logs structured rejection, forwarding, and upstream non-2xx diagnostics from
`cloudflare-worker/src/sentry-tunnel-diagnostics.mts`. Forwarding failures and upstream non-2xx
responses include sanitized envelope item counts and item types after DSN host/project validation;
they never log envelope payloads, DSN keys, or Sentry response headers.
