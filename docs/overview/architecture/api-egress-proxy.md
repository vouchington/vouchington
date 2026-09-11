# API egress proxy

The API tasks run without public IPv4. Provider calls that still require IPv4 can use a Squid HTTP
CONNECT sidecar hosted by the `worker-cpu` ECS service and reached through ECS Service Connect at
`http://api-egress-proxy:3128`.

This is an explicit transport, not an ambient process proxy. The API does not set `HTTP_PROXY` or
`HTTPS_PROXY`. Each supported provider owns a boolean in the `api-egress-proxy` DynamicConfig
namespace:

- `stripe_enabled`
- `openai_moderation_enabled`
- `apple_oauth_enabled`
- `github_oauth_enabled`
- `x_oauth_enabled`
- `bluesky_oauth_enabled`
- `fediverse_search_enabled`
- `bedrock_embeddings_enabled`

Flags default on in staging and production and off locally. The API installs the DynamicConfig
resolver during bootstrap, and each operation reads its provider flag at request time. Worker
entrypoints do not install a resolver, so shared clients remain direct there. An enabled route with
a missing or invalid `API_EGRESS_PROXY_URL` fails closed, and a failed proxied request never retries
through the direct path.

The proxy accepts CONNECT to port 443 only, blocks private, link-local, metadata, documentation, and
reserved destinations after DNS resolution, performs no TLS interception, and does not cache.
Application clients retain provider TLS verification and authentication end to end.

## Rollout and removal

Infrastructure must publish the worker task's named proxy port and Service Connect endpoint before
an API image with deployed-default flags is released. After staging validation, remove the retired
proxy-routing DynamicConfig namespace and rebuild the pre-production database so deleted
request-handoff tables and the removed migration cannot survive as schema drift. The retired queue,
schedule, reply keys, and dead-letter records may then be removed from staging Valkey. Production
never used this path, so it requires no expand/contract compatibility window.
