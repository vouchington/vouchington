# PostgreSQL System

This system manages our PostgreSQL migrations, view updates, and idempotent operations.

## Queue Configuration

### Concurrency

The worker uses a global concurrency of 1 to ensure database operations run sequentially.

### Job Types

- Database migrations
- View materialization updates
- Entity history tracking
- Idempotent schema operations
- Monthly partition creation
- Daily partition retention cleanup
- Data-retention cleanup for users, referrals, orphaned OAuth accounts, OAuth broker/RPC expiry, and Bluesky link expiry
- Materialized view refresh, including RSS crawl-tier refresh at 01:00 UTC and top hashtags hourly

Materialized-view refreshes share a primary-database advisory lock. Top-hashtag refreshes also use
a five-minute debounce and GlideMQ ordering key, so content bursts become one globally serialized
refresh while the hourly schedule remains a recovery path.

## Testing

**Important**: `BULLMQ_INLINE_MODE` is intentionally **disabled** for psql jobs. Running migrations, views, or idempotent operations inline during tests can cause database state issues and conflicts. These jobs are always enqueued, even in test mode.

## Views

- Normal view updates should succeed through `CREATE OR REPLACE VIEW` files in [`backend/data-stores/psql/views/`](../../data-stores/psql/views/).
- When a view signature change requires dropping dependent views first, use the forced rebuild path (`runViews({ forced: true })` or `pnpm --dir backend db:migrate -- --forced`) instead of adding `DROP VIEW` to the SQL files.

## Partition Jobs

- `createPartitions` and `cleanupPartitions` operate on the monthly RANGE tables registered in the canonical [partitioning strategy](../../../docs/overview/architecture/partitioning-strategy.md): conversation agentic runs/events, crawls, crawl chunks, and RSS feed crawls.
- `createPartitions` creates explicit future monthly partitions for those tables.
- `cleanupPartitions` drops expired monthly partitions for those tables.
- Partition cleanup is for whole-partition retention only; do not replace it with row-delete cleanup for debug tables unless the access pattern changes materially.

## Data Retention Cleanup

- `dataRetentionCleanup` runs on the serialized `psql` worker and delegates business rules to [`@services/data-retention`](../../services/data-retention/README.md).
- Cleanup is idempotent and uses bounded batches with short transactions/statements; repeated runs continue deleting remaining eligible rows.
- Soft-deleted user cleanup first reassigns or nulls dependent references for the selected user batch, then hard-deletes only that batch.

## Related

- Database: [../../data-stores/psql/CLAUDE.md](../../data-stores/psql/CLAUDE.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
