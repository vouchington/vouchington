# Fediverse Search

Provider-bucket search contract for Fediverse-style discovery. The service currently exposes the
search shell used by `/api/v1/fediverse/search` and isolates provider failures so PeerTube,
Mastodon, and Bluesky can be enabled independently behind the `fediverse` feature flag.

Search and NodeInfo classification always run in the API process. Their adapters select an outbound
dispatcher at request time through `@modules/api-egress-proxy`. The
`api-egress-proxy.fediverse_search_enabled` flag defaults off locally and on in deployed
environments; when enabled, provider requests use the configured HTTP CONNECT proxy. A proxy
failure never falls back to direct provider network I/O. Search reports a `provider_error` bucket
for the failed provider, while best-effort classification degrades to unclassified metadata.

This package is intentionally search-only. It does not implement ActivityPub delivery, inbox or
outbox routes, WebFinger, NodeInfo, Mastodon-compatible APIs, or federation for reviews and data
points.
