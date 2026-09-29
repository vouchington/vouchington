# Read-Then-Write Lookup Upserts

[Back to PostgreSQL Data Store](README.md#read-then-write-lookup-upserts)

Hot get-or-create paths for identity-backed lookup tables should read first, then write only on
misses. This keeps existing-row lookups on the read replica and avoids routine identity sequence
advancement. PostgreSQL evaluates identity defaults before `INSERT ... ON CONFLICT`, so conflict
heavy inserts can burn sequence values even when almost every call returns an existing row.

When a writer-side reconciliation is required, use PostgreSQL 18 `MERGE` or take an advisory lock
and re-check the primary inside a transaction before inserting. Keep `ON CONFLICT` for UUID-backed
tables, composite relationship rows, seed/static data, or paths where its atomic conflict behavior
is intentionally required and sequence burn is not meaningful.
