# Bot Tiers

[Back to Cloudflare Worker](README.md#bot-tiers)

Bots are classified into two tiers using [`src/bot-tier.mts`](src/bot-tier.mts):

| Tier      | Description                                                                                 | Rate limit behavior                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `known`   | Search engines, AI crawlers (ChatGPT, Perplexity, ClaudeBot), social previewers, monitoring | Normal pre-cache rate limiting (same as humans)                                                                                                                                                                |
| `unknown` | Any bot detected by `isbot()` that is not in the known list                                 | GET/HEAD cache misses and other non-cacheable requests use post-cache `RATE_LIMITER_BOT_*` (cached responses are free); mutating requests use both pre-cache anonymous/server-action and post-cache bot limits |

The tier is determined once per request in `index.mts` and passed through to `getCachePolicy()` and `checkIdentityRateLimit()`. Both known and unknown bots receive the same cache behavior (24h TTL, session cookies stripped). No bots are blocked by tier alone — only rate limiting applies.

The `x-voucha-bot-tier: known|unknown` response header is added when a bot is detected (not set for human traffic).
