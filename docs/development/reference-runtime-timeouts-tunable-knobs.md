# Tunable performance knobs

[Back to Runtime Timeouts](runtime-timeouts.md#tunable-performance-knobs)

These bound infrastructure or in-app work rather than a specific external protocol. They can be
retuned without violating a hard constraint, and several are enforced by the regression tests
listed in [Regression coverage](reference-runtime-timeouts-regression-coverage.md#regression-coverage).

| Concern                            | File                                         | Value(s)                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared external undici dispatchers | `backend/modules/utils/http-dispatchers.mts` | Routine `headersTimeout` 60,000; long-running AI `headersTimeout` 300,000; both use `bodyTimeout` 300,000, `keepAliveTimeout` 4,000, `keepAliveMaxTimeout` 600,000, and `connect.timeout` 10,000 (see [Shared undici dispatchers](reference-runtime-timeouts-shared-undici-dispatchers.md#shared-undici-dispatchers)) |
| Node HTTP server (API entrypoint)  | `backend/entrypoints/api/serve.mts`          | `requestTimeout` 300,000; `headersTimeout` 60,000; `keepAliveTimeout` 5,000; `timeout` (socket-inactivity) left disabled — see [Node HTTP server](reference-runtime-timeouts-node-http-server.md#node-http-server)                                                                                                    |
| SSE connection cycles              | `backend/api/sse-helpers.mts`                | Default 60,000; maximum 120,000. `startSSE` owns the lifecycle signal and rejects longer cycles.                                                                                                                                                                                                                      |
