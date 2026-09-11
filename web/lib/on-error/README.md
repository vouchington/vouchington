# Client-side onError

Centralized client-side error and success handler. Mirrors [`backend/modules/on-error`](../../../backend/modules/on-error/README.md).

- `onError(err, { fallback, tags?, extra?, skipSentry? })` — toasts a user-safe message via Sonner and reports unexpected errors to Sentry. 4xx `ApiError` instances are toast-only (matches the backend filter and the Sentry `beforeSend` hook). Pass `skipSentry: true` for client-side validation or business-outcome toasts that wrap a string in `new Error(...)`.
- `onSuccess(message, { description? })` — shows a success toast.
- `filterSentryEvent(event, hint)` — drops expected 4xx errors before request metadata is scrubbed.
- `scrubSentryError(event, hint)` — the `beforeSend` hook used by all three web runtimes; filters
  first and scrubs every final non-null event.
- `scrubSentrySpan(span)` / `scrubSentryTransaction(event, hint)` — remove URL query
  strings/fragments and redact request credential headers and cookies from span and transaction
  metadata.

## When to call

| Interaction                                                  | Use                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Mutation (create/update/delete, upload, send)                | `onSuccess` on success **and** `onError` on failure.                |
| Non-mutation that can fail (search, filter, read-only fetch) | `onError` on failure only — the resulting UI is the success signal. |
| Pure UI affordance (toggle, open panel)                      | Nothing.                                                            |

## Branching

Branch on precondition codes (`IDENTITY_REQUIRED`, `MFA_REAUTH_REQUIRED`, etc.) BEFORE calling `onError` so the precondition modal opens instead of a toast.

```ts
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess } from '@/lib/on-error'

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
}
```

## Why this exists

Direct `toast.error(err.message)` calls inside `try/catch` blocks swallow 5xx and non-`ApiError` failures — Sentry's automatic instrumentation never sees them. `onError` toasts the user-safe message AND reports unexpected errors to Sentry. 4xx `ApiError` instances are filtered out: those are expected client errors.

The shape mirrors `backend/modules/on-error` (`onError`, `tags`, `extra`, `filterSentryEvent`) so the contract reads the same on both sides of the stack.

## See also

- [`docs/overview/architecture/error-handling.md`](../../../docs/overview/architecture/error-handling.md)
- [`backend/modules/on-error/README.md`](../../../backend/modules/on-error/README.md)
- [Sentry request-metadata scrubbing](../../../docs/requirements/security/reference-security-observability-scrubbing.md)
