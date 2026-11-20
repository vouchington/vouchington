# API keys

- All callers use `validateApiKey()` from `@services/api-keys`; never hash raw keys and query `api_keys` directly.
- Update `API_KEY_TYPES` in `format.mts` and PostgreSQL `api_key_types` together.
- Preserve validation order: `validateApiKeyChecksum` structural/HMAC verification (no I/O) →
  Valkey Bloom probe → Postgres `getApiKeyByHash` → permissions.
- Revocation does not update Bloom: `revoked_at IS NULL` invalidates reads; an admin rebuild removes
  revoked entries; missed adds use entity-listener reconciliation.
- Raw keys are one-way and displayed once at creation; no API/export/log/test helper may recover or
  return them afterward.
- `API_KEY_CHECKSUM_SECRET` is long-lived; rotation requires key migration.
