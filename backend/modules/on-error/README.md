# Errors

This module provides shared error classes for crawler operations and other modules that need standardized error handling. It also exports the common error code registry and a `createCodedError` helper.

## Error Code Registry

All common error codes are defined in `error-codes.mts` and re-exported from this module's barrel:

```typescript
import { NOT_FOUND, RATE_LIMIT } from '@modules/on-error/error-codes'
// or via barrel:
import onError, { NOT_FOUND } from '@modules/on-error'
```

## createCodedError

For creating errors with codes in services (which don't have access to `ctx`):

```typescript
import { createCodedError } from '@modules/on-error'
import { RATE_LIMIT } from '@modules/on-error/error-codes'

throw createCodedError(429, 'Rate limit exceeded', RATE_LIMIT)
```

## Error Guidelines

- Errors should have a `.status` property for relevant HTTP errors (e.g., 429, 500, 503).
- Errors should have a `.code` property for an internal error code for handling. It can be the same as the class name.
- Errors should define a `cause` property when wrapping another error.
- **Avoid checking `error.message` for internally created errors.** Use `error.name`, `error.code`, or `error.status` instead. The `error.message` property is intended for human-readable text and may change, while structured properties provide reliable error identification.

## Error Handling

All error classes are designed to work with the `onError` handler in this module, which:

- Logs errors appropriately based on environment
- Sends 5xx errors to Sentry in production
- Ignores certain error codes and statuses (e.g., 404, ECONNRESET, EPIPE)
- Suppresses expected crawler operational failures from stderr and Sentry; crawler services persist these outcomes in crawl rows, hostname counters, referral link state, and analytics instead.

Errors with a `.status` property will be properly categorized by the error handler.

## Sentry Request-Metadata Scrubbing

`createSentryInitOptions()` filters expected error events first, then scrubs every final non-null
event. Its span and transaction hooks apply the same request-metadata contract: URL query strings
and fragments are removed, while credential headers and cookies are replaced with `[Filtered]`.
See [Sentry request-metadata scrubbing](../../../docs/requirements/security/reference-security-observability-scrubbing.md).

## Sentry Test Routing

Tests that use the shared Sentry mock setup (`backend/test-helpers/vitest.setup.sentry-mock.mts`)
must live in `.mock.test.mts` files so Vitest routes them to the isolated `backend-mocks` project.
Pure `backend-modules` tests run with `isolate: false`; importing that setup helper there can leak
`globalThis.vouchaSentryMocks` into later files in the same worker.
