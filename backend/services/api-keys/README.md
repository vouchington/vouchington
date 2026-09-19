# @services/api-keys

API key lifecycle management — creation, generation, validation, search, and revocation.

## Key Format

All keys follow `voucha_<type>_<32 hex random>_<16 hex HMAC checksum>`.

Example: `voucha_rss_a1b2c3d4e5f6789012345678abcdef01_a3f29c7e4d8b1f05`

- **Brand prefix**: `voucha_`
- **Type segment**: `rss` or `mcp` (kept in sync between `API_KEY_TYPES` in `format.mts` and the `api_key_types` PostgreSQL enum)
- **Random**: 16 bytes → 32 lowercase hex chars (128-bit entropy)
- **Checksum**: first 16 hex chars of `HMAC-SHA256(API_KEY_CHECKSUM_SECRET, "voucha_<type>_<random>")`
- **DB `prefix` column**: `voucha_${type}_${random.slice(0, 4)}` (e.g. `voucha_rss_a1b2`)
- **DB `key_hash` column**: SHA-256 of the full raw key (32-byte BYTEA); raw keys are never persisted

## Validation Pipeline

Validation runs in this order (do not reorder):

1. `parseApiKey` — structural parse, no I/O
2. `validateApiKeyChecksum` — HMAC verify via `timingSafeEqual`, no I/O
3. Bloom filter probe — Valkey (skipped when `apiKeyBloomFilterEnabled` is false); `false` → reject; `null` → fall through
4. `getApiKeyByHash` — Postgres lookup
5. Validate the complete persisted scope set against the canonical catalogue and key type, then check typed scope membership
6. Fire-and-forget `last_used_at` update

Revocation invalidates a key by setting `revoked_at`; all DB lookups include `revoked_at IS NULL`.

Creation validates scopes inside `createApiKey()` before persistence, including direct service callers.
Scope arrays are stored in canonical lexical order with no duplicates. RSS keys accept only
`rss:read`; MCP keys accept one user or admin audience, and admin scopes additionally require an
administrator owner. Unknown, noncanonical, cross-type, mixed-audience, and write-without-read sets
fail closed. The shared catalogue lives in [`@modules/scopes`](../../modules/scopes/README.md).

## Bloom Filter

The bloom filter stores hex-encoded SHA-256 hashes of active keys. It is:

- Populated on `createApiKey` (awaited via `addKeyHashToBloomFilter`)
- Rebuilt weekly (Sunday 8AM UTC) via `processRebuildBloomFilter`
- Read through a ready-aware Lua probe that checks the rebuild marker and Bloom filter key before `BF.EXISTS`; missing or partial filters fall back to PostgreSQL.
- Controlled by the `apiKeyBloomFilterEnabled` flag in `bloom-filter-config`

## Key exports

- `createApiKey(currentUserId, type, label, permissions)` — creates a new API key record
- `generateApiKey(type)` — generates a cryptographically random key with checksum
- `validateApiKey(rawKey, requiredPermission)` — validates a raw key through the full pipeline
- `parseApiKey(rawKey)` — structural parse only, no I/O
- `validateApiKeyChecksum(rawKey)` — HMAC checksum verification, no I/O
- `searchApiKeys(currentUserId)` — list of active keys for a user
- `revokeApiKey(currentUserId, keyId)` — revokes a key (soft delete)
- `checkApiKeyBloomFilter(keyHash)` — Valkey bloom probe
- `addKeyHashToBloomFilter(keyHash)` — add to bloom filter
- `rebuildApiKeyBloomFilter()` — full rebuild from DB
- `deleteApiKeyBloomFilter()` — remove from bloom filter
- `API_KEY_TYPES` — typed enum of valid key types
- `ApiKey` — shared type (includes `type` field)
- `ApiKeyType` — union type of valid key types

## Related

- Agent security invariants: [CLAUDE.md](CLAUDE.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
- Auth: [../jwt-session/README.md](../jwt-session/README.md)
- Requirements: [../../../docs/requirements/users/api-keys.md](../../../docs/requirements/users/api-keys.md)
- Bloom filters system: [../../queues/bloom-filters/README.md](../../queues/bloom-filters/README.md)
