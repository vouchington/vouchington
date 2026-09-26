# Request client information module

Validates the client metadata contract for interactive API requests and stores trusted request
context in `AsyncLocalStorage`.

The listener derives device identity from a verified `dt` cookie, except during
`PATCH /api/v1/session` bootstrap, and derives the IP address from origin-guarded proxy metadata.
Callers can read the immutable context with `getRequestClientInfo()`.

The context holds `{ origin, clientInfo }`. `runWithSessionRequestContext()` enters it for
browser-session requests and `runWithCredentialRequestContext()` for API-key and OAuth requests;
`getOptionalRequestOrigin()` reads the origin. Route handlers call `getRequestContentProvenance()`
to get the `ContentProvenance` a content write records; it rejects a session request without
validated client information with `400 INVALID_CLIENT_INFO`. `resolveContentProvenance()` is the
pure mapping it uses.

See [the architecture contract](../../../docs/overview/architecture/request-client-info.md) and
[content provenance](../../../docs/requirements/content/content-provenance.md).
