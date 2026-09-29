# Request client information module

Source entrypoint: [backend/modules/request-client-info/README.md](../../../../../../backend/modules/request-client-info/README.md)

Validates the client metadata contract for interactive API requests and stores trusted request
context in `AsyncLocalStorage`.

The listener derives device identity from a verified `dt` cookie, except during
`PATCH /api/v1/session` bootstrap, and derives the IP address from origin-guarded proxy metadata.
Callers can read the immutable context with `getRequestClientInfo()`.

See [the architecture contract](../../../request-client-info.md).
