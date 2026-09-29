# Timestamps

[Back to PostgreSQL Data Store](README.md#timestamps)

- Use `TIMESTAMPTZ` everywhere.
- Most tables should have `updated_at` maintained by a `BEFORE UPDATE` trigger.
- Applications should not set `updated_at` directly.
- When `created_at` is generated from a UUIDv7 `id`, query by `id` rather than by `created_at`.
