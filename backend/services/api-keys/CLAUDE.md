# API Keys

Single owner of API key format, validation, and storage.
Requirements: [../../../docs/requirements/users/api-keys.md](../../../docs/requirements/users/api-keys.md).

## Rules

- All callers must go through `validateApiKey()` from `@services/api-keys` — never SHA-256 a raw key and query `api_keys` directly.
- Key format and validation-stage details are canonical in [README.md](README.md). When adding a new type, update `API_KEY_TYPES` in `format.mts` and the `api_key_types` PostgreSQL enum together.
- **Validation order (do not reorder):** (1) `validateApiKeyChecksum` — structural parse + HMAC verify, no I/O; (2) bloom filter probe — Valkey; (3) `getApiKeyByHash` — Postgres; (4) permission check. The bloom + checksum fast-paths prevent invalid-key floods from hitting Postgres.
- On `revokeApiKey`: no bloom action — `revoked_at IS NULL` index filter handles invalidation; weekly rebuild trims revoked entries.
- API keys are one-way and one-time display. Do not add any API, export, log, or test helper that recovers or returns raw keys after creation.
- `API_KEY_CHECKSUM_SECRET` is long-lived — treat rotation as requiring a key migration.

## See Also

- Parent services: [../CLAUDE.md](../CLAUDE.md)
- Requirements: [../../../docs/requirements/users/api-keys.md](../../../docs/requirements/users/api-keys.md)
- Service reference: [README.md](README.md)
