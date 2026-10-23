import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import { PARTITION_POLICIES } from '../schema-growth-registry.mts'
import { beginTransaction } from '../setup.mts'
import type { TransactionQuery } from '../types.mts'
import { assertNoDirectChildForeignKeys } from './split-default-range-catalog.mts'

const MAX_RETIRE_ROWS = 10_000

type RangePartition = { table: string; partitionName: string }
export type RetireExplicitRangeInput = RangePartition & {
  dependentPartitions?: readonly RangePartition[]
  lockTables?: readonly string[]
  /** Called after every named relation is locked and before any detach or drop. */
  beforeDetach: (query: TransactionQuery, partitionName: string) => Promise<void>
}

/** Shared operator transaction. Family-specific retention and external-object checks run inside it. */
/* oxlint-disable no-await-in-loop -- catalog checks and dependent DDL must stay serial in one locked transaction */
export async function retireExplicitRange(input: RetireExplicitRangeInput): Promise<number> {
  const parent = checkedPartition(input)
  const dependents = (input.dependentPartitions ?? []).map(checkedPartition)
  const extraLocks = (input.lockTables ?? []).map(assertSafeSqlIdentifier)
  await using query = await beginTransaction()
  const parentBound = await assertExplicitMembership(query, parent)
  for (const member of [...dependents, parent]) {
    // no-mistakes-disable-next-line query-reached-per-item: operator-listed partitions are checked serially on one locked transaction
    const bound = await assertExplicitMembership(query, member)
    if (bound !== parentBound) throw new Error('Dependent range bounds must match the parent range')
  }
  const lockTables = [
    ...new Set([
      ...dependents.flatMap(member => [member.table, member.partitionName]),
      parent.table,
      parent.partitionName,
      ...extraLocks,
    ]),
  ].toSorted()
  await query(`/* lockExplicitRangeRetirement */
    LOCK TABLE ${lockTables.join(', ')} IN ACCESS EXCLUSIVE MODE`)
  for (const member of [...dependents, parent]) {
    // no-mistakes-disable-next-line query-reached-per-item: operator-listed partitions are checked serially on one locked transaction
    const bound = await assertExplicitMembership(query, member)
    if (bound !== parentBound)
      throw new Error('Dependent range bounds changed while acquiring locks')
    // no-mistakes-disable-next-line query-reached-per-item: each bounded child partition is checked under the same exclusive lock
    await assertNoDirectChildForeignKeys(query, member.partitionName)
    // no-mistakes-disable-next-line query-reached-per-item: operator-listed partitions have independent hard row caps
    const { rows } = await query<{ row_count: number }>(
      `/* countBoundedExplicitRetirementRows */
      SELECT count(*)::int AS row_count FROM (
        SELECT 1 FROM ${member.partitionName} LIMIT $1
      ) bounded`,
      [MAX_RETIRE_ROWS + 1],
    )
    if ((rows[0]?.row_count ?? 0) > MAX_RETIRE_ROWS) {
      throw new Error(`${member.partitionName} exceeds the manual retirement row cap`)
    }
  }
  const { rows: parentCount } = await query<{
    row_count: number
  }>(`/* countAcceptedExplicitRetirementRows */
    SELECT count(*)::int AS row_count FROM ${parent.partitionName}`)
  await input.beforeDetach(query, parent.partitionName)
  for (const member of [...dependents, parent]) {
    // no-mistakes-disable-next-line query-reached-per-item: dependent DDL must be serial in one transaction
    await query(`/* detachExplicitRetirementRange */ ALTER TABLE ${member.table}
      DETACH PARTITION ${member.partitionName}`)
    // no-mistakes-disable-next-line query-reached-per-item: dependent DDL must be serial in one transaction
    await query(`/* dropExplicitRetirementRange */ DROP TABLE ${member.partitionName}`)
  }
  await query.commit()
  return parentCount[0]?.row_count ?? 0
}
/* oxlint-enable no-await-in-loop */

function checkedPartition(input: RangePartition): RangePartition {
  const table = assertSafeSqlIdentifier(input.table)
  const partitionName = assertSafeSqlIdentifier(input.partitionName)
  const policy = PARTITION_POLICIES.get(table)
  if (policy?.strategy !== 'RANGE' || policy.children !== 'default') {
    throw new Error(`${table} is not a registered DEFAULT-only RANGE table`)
  }
  return { table, partitionName }
}

async function assertExplicitMembership(
  query: TransactionQuery,
  member: RangePartition,
): Promise<string> {
  const { rows } = await query<{ bound: string }>(
    `/* assertExplicitRetirementMembership */
    SELECT pg_get_expr(child.relpartbound, child.oid) AS bound FROM pg_inherits inheritance
    JOIN pg_class child ON child.oid = inheritance.inhrelid
    JOIN pg_class parent ON parent.oid = inheritance.inhparent
    JOIN pg_namespace ns ON ns.oid = parent.relnamespace
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    WHERE ns.nspname = current_schema() AND parent.relname = $1
      AND child_ns.nspname = current_schema()
      AND child.relname = $2 AND pg_get_expr(child.relpartbound, child.oid) <> 'DEFAULT'
    LIMIT 1`,
    [member.table, member.partitionName],
  )
  if (rows.length !== 1)
    throw new Error(`${member.partitionName} is not an explicit range of ${member.table}`)
  return rows[0].bound
}
