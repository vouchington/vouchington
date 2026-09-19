---
title: 'Voucha API Keys: Programmatic Access to Community Data'
slug: api-keys-guide
post_type: article
topics:
  - voucha
---

# Voucha API Keys: Programmatic Access to Community Data

API keys give you programmatic access to Voucha data without logging in through a browser session. The initial scope is RSS feed access, with additional API features planned as the platform expands.

## Key Format

Voucha API keys use the format `voucha_<type>_<32 hex random>_<16 hex checksum>`.

Example: `voucha_rss_a1b2c3d4e5f6789012345678abcdef01_a3f29c7e4d8b1f05`

- **Brand prefix**: `voucha_`
- **Type segment**: identifies the key's scope (e.g., `rss`)
- **Random**: 32 hex characters (128-bit entropy)
- **Checksum**: 16 hex characters (HMAC-SHA256 for tamper detection)

The display prefix (e.g., `voucha_rss_a1b2`) is shown in the key management UI so you can identify your keys without storing the full key. Keys are stored as SHA-256 hashes. The raw key is shown exactly once at creation time. If you lose it, you'll need to create a new one.

## Creating an API Key

1. Go to **Settings → API Keys** at `/my/api-keys`
2. Click **Create API Key**
3. Enter a label that describes what you're using the key for (e.g., "Feed Reader Integration", "Home Dashboard")
4. Copy the full key immediately — it won't be shown again

The `rss:read` scope is assigned automatically. Additional scopes will be added as new API features ship.

## Using Your Key: RSS Feeds

Append `apikey=YOUR_KEY` as a query parameter to any RSS feed endpoint:

```
/rss/posts?topics=artificial-intelligence&post_type=discussion&apikey=voucha_rss_abc1...
/rss/news?topics=credit-cards&apikey=voucha_rss_abc1...
/rss/posts?user=johndoe&apikey=voucha_rss_abc1...
```

### `/rss/posts` Parameters

| Parameter   | Description                                          |
| ----------- | ---------------------------------------------------- |
| `topics`    | Comma-separated topic slugs to filter by             |
| `post_type` | Filter by type: `discussion`, `review`, `data_point` |
| `user`      | Filter by username                                   |
| `apikey`    | Your API key (required)                              |

### `/rss/news` Parameters

| Parameter | Description                                         |
| --------- | --------------------------------------------------- |
| `topics`  | Comma-separated topic slugs to filter by            |
| `sources` | Comma-separated topic slugs to filter by RSS source |
| `apikey`  | Your API key (required)                             |

## Rate Limits

RSS endpoints allow **3 requests per minute per API key per route**, and **3 requests per minute per IP address per route**. Both limits apply simultaneously — the fourth request within a 60-second window returns 429. This is generous for periodic polling (every 20 seconds) but restrictive for high-frequency automation.

If you're building a home dashboard or feed reader integration, a 60-second poll interval keeps you well within limits.

## Security Practices

A few things to keep in mind:

**Store keys securely.** Since the raw key is shown only once, treat it like a password. Use environment variables rather than hardcoding it in source code.

**One key per integration.** Use a separate key for each application or script. If one key is compromised, you can revoke it without disrupting other integrations.

**Monitor last_used_at.** The key management page shows the last time each key was used. Keys that haven't been used recently are candidates for revocation.

**Revoke immediately if compromised.** Go to Settings → API Keys and click Revoke. The key is invalid immediately. Create a new key and update your integration.

## What You Can Build

With access to structured, trust-weighted community data via RSS, the natural integrations are:

- **Feed readers** — subscribe to Voucha topic feeds in your preferred reader alongside other sources
- **Home dashboards** — surface community-verified product intelligence next to price trackers and news feeds
- **Automated alerts** — poll for new reviews or data points on topics you're monitoring and trigger notifications
- **Research pipelines** — pull structured community data into analysis workflows

The data you access reflects Voucha's trust weighting: low-trust accounts' contributions are present but carry appropriate weight in aggregates, and the community's vote-verified content surfaces first.

See also: [Voucha for Developers](for-developers.md) for the broader technical architecture.
