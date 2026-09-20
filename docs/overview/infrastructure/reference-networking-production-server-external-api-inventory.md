# Networking reference

[Back to Networking](networking.md)

## Production Server External API Inventory

This is the canonical inventory for production-originated traffic from the backend API and
workers, Next.js server, Cloudflare Worker, and Lambdas. It excludes browser/native-client,
CI, development, and test-only traffic. An API host is eligible for direct calls from the API tier
only when its exact production hostname has verified IPv6 support. IPv4-only fixed hosts and every
dynamic host class remain outside the API allowlist; supported synchronous API callers select the
provider-scoped HTTP CONNECT transport.

DNS evidence below was refreshed on **2026-07-22** with both
`dig +noall +answer <host> A` and `dig +noall +answer <host> AAAA`. Re-run both commands before an
IPv6-only rollout because DNS support can change independently. A CNAME chain counts as IPv6-capable
only when its terminal answer includes AAAA.

### Fixed third-party hosts

| Provider / purpose                 | Production hostname                  | Caller / route                                              | IPv6 | API direct-call allowlist   |
| ---------------------------------- | ------------------------------------ | ----------------------------------------------------------- | ---- | --------------------------- |
| Sentry backend ingest              | Configured Sentry DSN origin         | API direct                                                  | Yes  | **Allowed when configured** |
| Cloudflare Turnstile verification  | `challenges.cloudflare.com`          | API direct                                                  | Yes  | **Allowed, exact host**     |
| Google reCAPTCHA Enterprise        | `recaptchaenterprise.googleapis.com` | API direct                                                  | Yes  | **Allowed, exact host**     |
| Google Web Risk                    | `webrisk.googleapis.com`             | API direct                                                  | Yes  | **Allowed, exact host**     |
| Google OAuth signing certificates  | `www.googleapis.com`                 | API direct                                                  | Yes  | **Allowed, exact host**     |
| Facebook OAuth / Graph API         | `graph.facebook.com`                 | API direct                                                  | Yes  | **Allowed, exact host**     |
| LinkedIn OAuth token               | `www.linkedin.com`                   | API direct                                                  | Yes  | **Allowed, exact host**     |
| LinkedIn user info                 | `api.linkedin.com`                   | API direct                                                  | Yes  | **Allowed, exact host**     |
| Microsoft OAuth token              | `login.microsoftonline.com`          | API direct                                                  | Yes  | **Allowed, exact host**     |
| Microsoft Graph profile            | `graph.microsoft.com`                | API direct                                                  | Yes  | **Allowed, exact host**     |
| Apple OAuth keys                   | `appleid.apple.com`                  | API provider transport; defaults proxied                    | No   | No                          |
| GitHub OAuth token                 | `github.com`                         | API provider transport; defaults proxied                    | No   | No                          |
| GitHub profile / email / following | `api.github.com`                     | API provider transport; defaults proxied                    | No   | No                          |
| X OAuth / API                      | `api.x.com`                          | API provider transport; defaults proxied                    | No   | No                          |
| Stripe API                         | `api.stripe.com`                     | API provider transport; defaults proxied                    | No   | No                          |
| OpenAI API                         | `api.openai.com`                     | Direct moderation transport; retained agents use OpenRouter | No   | No                          |
| OpenRouter OpenResponses API       | `openrouter.ai`                      | Retained-agent provider transport                           | No   | No                          |
| Anthropic Messages API             | `api.anthropic.com`                  | Backend worker direct                                       | Yes  | N/A; API does not dial it   |
| Wikipedia Core API                 | `api.wikimedia.org`                  | Backend worker direct                                       | Yes  | N/A; API does not dial it   |
| Wikipedia REST API                 | `en.wikipedia.org`                   | Backend worker direct                                       | Yes  | N/A; API does not dial it   |
| Kagi and blacklist GitHub sources  | `raw.githubusercontent.com`          | Backend worker direct                                       | Yes  | N/A; API does not dial it   |
| Ubuntu101 domain blacklist         | `hosts.ubuntu101.co.za`              | Backend worker direct                                       | Yes  | N/A; API does not dial it   |
| Gmail SMTP                         | `smtp.gmail.com`                     | Backend worker direct                                       | Yes  | N/A; API does not dial it   |
| Sentry web/edge/lambda ingest      | Configured Sentry DSN origin         | Next.js server, Cloudflare Worker, Lambdas                  | Yes  | N/A; separate runtimes      |

The Cloudflare Worker `/monitoring` tunnel accepts only the configured web and Worker Sentry DSNs.
The backend sends directly to its configured IPv6-capable Sentry origin; allowing it through the
tunnel would create a circular Worker-to-backend error-reporting dependency.

### Configured origins and dynamic host classes

These targets cannot be represented by a permanent exact-host allowlist. Their resolved addresses
are validated at the call boundary where applicable, but their IPv6 capability is per deployment or
per target.

| Target class                                                     | Caller / route                                   | IPv6 status                                                       | API direct-call decision                                     |
| ---------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Backend, web, sitemap, and image origins                         | Cloudflare Worker, web server, SES Lambda        | Deployment-specific; Voucha public origins are Cloudflare-fronted | Internal/configured route, not a third-party allowlist entry |
| RSS feeds, crawled pages, robots, verification files             | Backend workers and browser-crawl Lambda         | Mixed per target                                                  | Never blanket-allow; workers retain IPv4                     |
| ActivityPub actors, inboxes, NodeInfo, Mastodon, Lemmy, PeerTube | Backend workers                                  | Mixed per instance                                                | Never blanket-allow; workers retain IPv4                     |
| Bluesky handle, DID, authorization, PDS, and AppView hosts       | API provider transport defaults proxied; workers | Mixed per discovered host                                         | Never blanket-allow                                          |
| Web Push subscription endpoints                                  | Backend workers                                  | Mixed per subscription                                            | Never blanket-allow; workers retain IPv4                     |
| Image sideload URLs                                              | Image-resize Lambda                              | Mixed per user-supplied target                                    | Never blanket-allow; SSRF validation and DNS pinning apply   |

Additional blocker: **IPv6-only disables ECS Exec** (`execute-command`), the primary in-container
debugging tool.

Shared HTTP client: `backend/modules/utils/http.mts` (undici + SSRF guard). Stripe, AWS SDKs,
OpenAI moderation, OAuth, Bluesky, and Fediverse adapters opt into the explicit provider transport.
