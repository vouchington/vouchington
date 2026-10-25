# Sentry request-metadata scrubbing

[Back to Security Architecture](SECURITY.md)

## Why scrubbing is mandatory

Unsubscribe tokens, email-verification tokens, and API keys travel as query parameters across this
codebase, so URLs shipped to Sentry would leak secrets. Sentry also copies request headers and
cookies into error Request Interfaces and span attributes without applying its own header
filtering. The app injects its credential-header vocabulary and Grafana path-redaction policy into
`@vouchington/utils/observability`; that package owns the shared copy-on-write scrubbing mechanics.
Application-side scrubbing is therefore mandatory defense in depth; hosted Sentry
scrubbing settings are not known from this repository.

## Data collection: the least-data policy

The product rule is that the least data leaves the app. By default Sentry collects the client IP,
cookies, query strings, every HTTP body, bound database values, stack-frame variables, queue task
arguments, and gen-AI inputs and outputs. Request bodies carry legal identities and perjury
statements from copyright forms, and gen-AI inputs carry user content and MCP tool arguments. So
`@vouchington/sentry` turns these off at the source and every SDK init site passes the policy as
`dataCollection` through `ts-shared/utils/sentry-init-options.mts`. The credential and URL scrubbing
configured in `ts-shared/utils/sentry-scrub-options.mts` is defense in depth behind that policy, not
the only control.

## Boundary

Every init site scrubs request metadata and bodies (URLs, query strings, credential headers,
cookies, span attributes) and recursively redacts sensitive keys and free-text secrets across the
whole event, including `user`, `extra`, `contexts`, and breadcrumbs. It does not inspect
attachments, replays, or logs. Scrubbers still drop body data that reaches the scope by any other
path.
