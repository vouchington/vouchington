import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { PARTITION_DROP_POLICIES } from '../config-driven/utils/partition-config.mts'
import { beginTransaction } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { getPartitionDropRefusal, type PartitionDropRefusal } from './partition-drop-guard.mts'

export type ExplicitHistoryRange = {
  table: 'post_revisions' | 'post_clearance_changes' | 'community_post_review_changes'
  partition: string
  fromId: string
  toId: string
}

const EXPLICIT_HISTORY_RANGE_TABLES: ReadonlySet<string> = new Set([
  'post_revisions',
  'post_clearance_changes',
  'community_post_review_changes',
])

const DDL_REFERENCE_LOCKS: Record<ExplicitHistoryRange['table'], readonly string[]> = {
  post_revisions: ['posts', 'users'],
  post_clearance_changes: [
    'posts',
    'retained_post_clearance_change_identities',
    'retained_user_identities',
  ],
  community_post_review_changes: [
    'community_post_reviews',
    'communities',
    'retained_user_identities',
  ],
}

export function isExplicitHistoryRangeTable(table: string): table is ExplicitHistoryRange['table'] {
  return EXPLICIT_HISTORY_RANGE_TABLES.has(table)
}

/** Owner-operated retirement of one previously split, complete UUIDv7 range. */
export async function retireExplicitHistoryRange(
  range: ExplicitHistoryRange,
  referenceDate: Date = new Date(),
): Promise<PartitionDropRefusal | 'catalog-mismatch' | null> {
  await using transaction = await beginTransaction()
  const refusal = await guardAndRetireExplicitHistoryRange(transaction, range, referenceDate)
  if (refusal) return refusal
  await transaction.commit()
  return null
}

/** The caller owns the transaction; no DDL happens before the locked catalog and hold checks. */
export async function guardAndRetireExplicitHistoryRange(
  query: QueryExecutor,
  range: ExplicitHistoryRange,
  referenceDate: Date,
): Promise<PartitionDropRefusal | 'catalog-mismatch' | null> {
  if (!isExplicitHistoryRangeTable(range.table)) return 'catalog-mismatch'
  const table = assertSafeSqlIdentifier(range.table)
  const partition = assertSafeSqlIdentifier(range.partition)
  const quotedTable = `"${table}"`
  const quotedPartition = `"${partition}"`
  const from = getDateFromUUIDv7(range.fromId)
  const upperBound = getDateFromUUIDv7(range.toId)
  if (!from || !upperBound || range.fromId.toLowerCase() >= range.toId.toLowerCase())
    return 'catalog-mismatch'
  if (!(await matchesCatalogRange(query, range))) return 'catalog-mismatch'

  // DDL needs FK-target locks. Take the live owner before history so a current writer cannot hold
  // its owner and wait for history while retirement waits for that owner. EXCLUSIVE also blocks
  // a writer's SELECT FOR UPDATE ROW SHARE lock; ordinary ACCESS SHARE reads remain available.
  // NOWAIT refuses concurrent writes instead of waiting into an opposite-order lock cycle.
  const [liveOwner, ...otherReferences] = DDL_REFERENCE_LOCKS[range.table]
  // ast-grep-ignore: no-three-sequential-awaits -- DDL reference locks must be acquired in this exact owner-to-child order within one transaction.
  await query(
    `/* retireExplicitHistoryRange:lockLiveOwner */ LOCK TABLE ONLY "${liveOwner}" IN EXCLUSIVE MODE NOWAIT`,
  )
  await query(
    `/* retireExplicitHistoryRange:lockHolds */ LOCK TABLE "user_legal_preservation_holds" IN EXCLUSIVE MODE NOWAIT`,
  )
  await query(
    `/* retireExplicitHistoryRange:lockReferences */ LOCK TABLE ONLY ${otherReferences.map(reference => `"${reference}"`).join(', ONLY ')} IN EXCLUSIVE MODE NOWAIT`,
  )
  await query(
    `/* retireExplicitHistoryRange:lockParent */ LOCK TABLE ONLY ${quotedTable} IN SHARE UPDATE EXCLUSIVE MODE NOWAIT`,
  )
  await query(
    `/* retireExplicitHistoryRange:lockChild */ LOCK TABLE ${quotedPartition} IN ACCESS EXCLUSIVE MODE NOWAIT`,
  )
  if (!(await matchesCatalogRange(query, range))) return 'catalog-mismatch'

  const reason = await getPartitionDropRefusal(
    query,
    { table, partition, upperBound },
    PARTITION_DROP_POLICIES[table],
    referenceDate,
  )
  if (reason) return reason
  await query(
    `/* retireExplicitHistoryRange:detach */ ALTER TABLE ${quotedTable} DETACH PARTITION ${quotedPartition}`,
  )
  await query(`/* retireExplicitHistoryRange:drop */ DROP TABLE ${quotedPartition}`)
  return null
}

async function matchesCatalogRange(
  query: QueryExecutor,
  range: ExplicitHistoryRange,
): Promise<boolean> {
  const { rows } = await query(
    `/* retireExplicitHistoryRange:catalog */
    SELECT 1 FROM pg_class parent
    JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
    JOIN pg_partitioned_table partitioned ON partitioned.partrelid = parent.oid
    JOIN pg_attribute partition_key ON partition_key.attrelid = parent.oid
      AND partition_key.attnum = partitioned.partattrs[0]
    JOIN pg_inherits inheritance ON inheritance.inhparent = parent.oid
    JOIN pg_class child ON child.oid = inheritance.inhrelid
    JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
    WHERE parent_namespace.nspname = current_schema()
      AND child_namespace.nspname = current_schema()
      AND parent.relname = $1 AND child.relname = $2
      AND partitioned.partstrat = 'r' AND partitioned.partnatts = 1
      AND partition_key.attname = 'id' AND child.relispartition
      AND pg_get_expr(child.relpartbound, child.oid) =
        format('FOR VALUES FROM (%L) TO (%L)', $3::uuid, $4::uuid)
    LIMIT 1`,
    [range.table, range.partition, range.fromId, range.toId],
  )
  return rows.length > 0
}
