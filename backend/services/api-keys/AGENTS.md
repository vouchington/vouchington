# API keys

- All callers use `validateApiKey()` from `@services/api-keys`; never hash raw keys and query `api_keys` directly.
- Update `API_KEY_TYPES` in `format.mts` and PostgreSQL `api_key_types` together. Format/stages belong in [README.md](../../../docs/overview/architecture/services/api-keys/README.md); product contract belongs in [requirements](../../../docs/requirements/users/api-keys.md).
- Preserve validation order: `validateApiKeyChecksum` structural/HMAC verification (no I/O) → Valkey Bloom probe → Postgres `getApiKeyByHash` → permissions.
- Revocation does not update Bloom: `revoked_at IS NULL` invalidates reads; weekly rebuild removes revoked entries.
- Raw keys are one-way and displayed once at creation; no API/export/log/test helper may recover or return them afterward.
- `API_KEY_CHECKSUM_SECRET` is long-lived; rotation requires key migration.
