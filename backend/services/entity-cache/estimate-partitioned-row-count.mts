import { read } from '@data-stores/psql'

/**
 * Planner row estimate summed over a partitioned table's partitions. Bloom filters only need a
 * capacity with headroom (backfills size at twice this), so a catalog read replaces a full count.
 */
export async function estimatePartitionedRowCount(
  table: 'posts' | 'rss_feed_items',
): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* estimatePartitionedRowCount */
    SELECT COALESCE(SUM(GREATEST(partition.reltuples, 0)), 0)::float8 AS count
    FROM pg_inherits inheritance
    JOIN pg_class partition ON partition.oid = inheritance.inhrelid
    WHERE inheritance.inhparent = $1::regclass`,
    [table],
  )
  return rows[0]?.count ?? 0
}
