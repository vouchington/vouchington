# PostgreSQL

- Schema docs: [PostgreSQL index](../../../docs/development/postgresql/README.md).
- Keep creators idempotent where possible. Hardcoded UUIDs are UUIDv7 (version nibble `7`).
- Never add `DROP TABLE` migrations. Fold new columns into their original creator; cross-file FKs
  use `ALTER TABLE ADD CONSTRAINT`.
- Fixed migrations and ledger inserts are transactional; never add manual `BEGIN`/`COMMIT` or
  online index-upgrade migrations.
- Vote schema uses [`election-schema-config.mts`](config-driven/utils/election-schema-config.mts).
- Prefer lifecycle timestamps over booleans/status columns. Keep final results on the owning row.
- No HASH partitions.
