import {
  assertSafeSqlIdentifier,
  filterRetainedMonthlyPartitionTables,
  parseMonthlyPartitionName,
} from '@vouchington/postgres/partitions'
import { ALL_MONTHLY_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import { write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import type { PartitionDropCandidate } from './partition-drop-guard.mts'

export type PartitionCleanupCursor = { priority: number; partition: string }
const MAX_PARTITION_CLEANUP_LIMIT = 50

export async function listMonthlyDropCandidates(
  query: QueryExecutor = write,
  limit: number = MAX_PARTITION_CLEANUP_LIMIT,
  after?: PartitionCleanupCursor,
): Promise<{
  candidates: PartitionDropCandidate[]
  hasMore: boolean
  nextCursor?: PartitionCleanupCursor
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PARTITION_CLEANUP_LIMIT)
    throw new Error('Monthly partition page limit is outside the supported range')
  const managed = filterRetainedMonthlyPartitionTables(ALL_MONTHLY_PARTITION_TABLES)
  const { rows } = await query(
    `/* listMonthlyDropCandidates */
      SELECT parent.relname::text AS parent_table,
             child.relname::text AS partition_table,
             managed.priority
      FROM UNNEST($1::text[], $2::integer[]) AS managed(table_name, priority)
      JOIN pg_class AS parent ON parent.relname = managed.table_name
      JOIN pg_namespace AS namespace ON namespace.oid = parent.relnamespace
      JOIN pg_inherits ON pg_inherits.inhparent = parent.oid
      JOIN pg_class AS child ON child.oid = pg_inherits.inhrelid
      WHERE namespace.nspname = current_schema()
        AND child.relname::text LIKE parent.relname::text || '__p_%'
        AND (managed.priority, child.relname::text) > ($3::integer, $4::text)
      ORDER BY managed.priority, child.relname::text
      LIMIT $5`,
    [
      managed.map(config => assertSafeSqlIdentifier(config.table)),
      managed.map(config => config.dropPriority ?? 2),
      after?.priority ?? -1,
      after?.partition ?? '',
      limit + 1,
    ],
  )
  const hasMore = rows.length > limit
  const selected = rows.slice(0, limit)
  const next = selected.at(-1)
  return {
    candidates: selected.flatMap(row => {
      const parsed = parseMonthlyPartitionName(row.partition_table)
      if (!parsed || parsed.table !== row.parent_table) return []
      return [
        {
          table: row.parent_table,
          partition: row.partition_table,
          upperBound: new Date(Date.UTC(parsed.year, parsed.month, 1)),
        },
      ]
    }),
    hasMore,
    ...(next && {
      nextCursor: { priority: Number(next.priority), partition: String(next.partition_table) },
    }),
  }
}
