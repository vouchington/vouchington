# WebSockets

[Back to Cloudflare Worker](README.md#websockets)

WebSocket proxying is disabled outside local development. The only supported
upgrade path is Next.js HMR at `/_next/webpack-hmr`, and only when
`DEV_WEBSOCKET_PROXY=true`, `PRODUCTION` is not `true`, and `WEB_ORIGIN` points
to localhost. In staging and production, or if `WEB_ORIGIN` is non-local, the
worker rejects WebSocket upgrades at the edge without fetching an origin.
