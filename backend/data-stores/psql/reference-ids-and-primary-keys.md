# IDs And Primary Keys

[Back to PostgreSQL Data Store](README.md#ids-and-primary-keys)

- `id` and `*_id` columns should use `UUID DEFAULT uuidv7()` or identity columns.
- Smaller lookup tables may use `INTEGER GENERATED ALWAYS AS IDENTITY`.
- Non-ID integers should use `INT`, not `BIGINT`.
- External third-party IDs should use `TEXT`.
- If a table uses UUIDv7 for its primary key, prefer deriving `created_at` from
  `uuid_extract_timestamp(id)` instead of storing a mutable app-managed timestamp.
- When partitioning, put the partition column first in the primary key.
