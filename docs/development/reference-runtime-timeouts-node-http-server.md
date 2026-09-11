# Node HTTP server

[Back to Runtime Timeouts](runtime-timeouts.md#node-http-server)

`backend/entrypoints/api/serve.mts` sets `requestTimeout: 300_000`, `headersTimeout: 60_000`, and
`keepAliveTimeout: 5_000` on `http.createServer` — equal to Node's own defaults, so again a
zero-behavior-change documentation move. `requestTimeout` bounds only the incoming request's
headers+body receipt; it does not bound response duration, so it does not cut long-lived SSE
responses. `server.timeout` (the legacy socket-inactivity timeout) is intentionally left
unset/disabled (`0`) — a positive value would cut sparse-write SSE streams (data-request, imports)
mid-flight regardless of whether they're actively producing events.
