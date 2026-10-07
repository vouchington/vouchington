# Bot Tiers

[Back to Cloudflare Worker](README.md#bot-tiers)

Bots are classified into two tiers using [`src/bot-tier.mts`](../../../../cloudflare-worker/src/bot-tier.mts):

| Tier      | Description                                                                                            | Rate limit behavior                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `known`   | Known User-Agent list (search, AI crawlers, social previewers, monitors) plus Cloudflare `verifiedBot` | Normal pre-cache rate limiting (same as humans)                                                                                                                                                                |
| `unknown` | Any other `isbot()` match, including a known User-Agent Cloudflare has not verified                    | GET/HEAD cache misses and other non-cacheable requests use post-cache `RATE_LIMITER_BOT_*` (cached responses are free); mutating requests use both pre-cache anonymous/server-action and post-cache bot limits |

`getBotTier()` returns `known` only when `isbot()` matches, the User-Agent contains one of the known substrings, and `verifiedBot` is true. [`index.mts`](../../../../cloudflare-worker/src/index.mts) reads that flag from `request.cf.botManagement.verifiedBot` once per request and passes the tier through to `getCachePolicy()` and `checkIdentityRateLimit()`. A matching User-Agent without the platform signal stays `unknown`, because the User-Agent header is spoofable.

Both known and unknown bots receive the same cache behavior (24h default TTL, session cookies stripped). No bots are blocked by tier alone — only rate limiting applies.

The `x-voucha-bot-tier: known|unknown` response header is added when a bot is detected (not set for human traffic).
