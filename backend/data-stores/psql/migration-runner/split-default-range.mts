import { createHash } from 'node:crypto'
import { getDateFromUUIDv7 } from '@modules/utils'
import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import { PARTITION_POLICIES } from '../schema-growth-registry.mts'
import { beginTransaction } from '../setup.mts'
import type { TransactionQuery } from '../types.mts'
import {
  assertNoDirectChildForeignKeys,
  readDeleteGuards,
  readCopyableColumns,
  readDefaultRangeCatalog,
  readReferencingForeignKeys,
} from './split-default-range-catalog.mts'

const MAX_MOVE_ROWS = 10_000
const MAX_DEFAULT_SCAN_ROWS = 100_000
const MAX_FK_REVALIDATION_ROWS = 100_000
const UUIDV7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const APPROVED_STRUCTURAL_DELETE_TRIGGERS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  classifier_decision_batch_candidates: {
    trigger_classifier_decision_batch_candidates_owner_delete:
      'fn_reject_classifier_batch_candidate_owner_delete',
  },
}

export type ExplicitRange = {
  table: string
  fromId: string
  toId: string
  maxRows: number
}

/** Keep admin admission and worker execution on the same explicit range contract. */
export function assertExplicitRange(input: ExplicitRange): { table: string; key: string } {
  const table = assertSafeSqlIdentifier(input.table)
  const policy = PARTITION_POLICIES.get(table)
  if (policy?.strategy !== 'RANGE' || policy.children !== 'default') {
    throw new Error(`${table} is not a registered DEFAULT-only RANGE table`)
  }
  const key = assertSafeSqlIdentifier(policy.key)
  if (
    !UUIDV7_PATTERN.test(input.fromId) ||
    !getDateFromUUIDv7(input.fromId) ||
    !UUIDV7_PATTERN.test(input.toId) ||
    !getDateFromUUIDv7(input.toId) ||
    input.fromId >= input.toId
  ) {
    throw new Error('An explicit range needs ordered lowercase UUIDv7 bounds')
  }
  if (!Number.isInteger(input.maxRows) || input.maxRows < 1 || input.maxRows > MAX_MOVE_ROWS) {
    throw new Error(`maxRows must be an integer from 1 through ${MAX_MOVE_ROWS}`)
  }
  return { table, key }
}

/** Split a populated DEFAULT through one locked, rollback-safe operator transaction. */
/* oxlint-disable no-await-in-loop -- FK DDL and row moves must stay serial in one locked transaction */
export async function splitDefaultRange(
  input: ExplicitRange,
): Promise<{ moved: number; name: string }> {
  const { table, key } = assertExplicitRange(input)
  const digest = createHash('sha256')
    .update(JSON.stringify([table, input.fromId, input.toId]))
    .digest('hex')
    .slice(0, 12)
  const name = assertSafeSqlIdentifier(`${table.slice(0, 42)}__r_${digest}`)
  await using query = await beginTransaction()
  const initial = await readDefaultRangeCatalog(query, table)
  const references = await readReferencingForeignKeys(query, table)
  const lockTables = [
    ...new Set([table, initial.partitionName, ...references.map(ref => ref.table_name)]),
  ].toSorted()
  // ast-grep-ignore: no-three-sequential-awaits -- lock then recheck the catalog and FKs on the same transaction before moving rows
  await query(`/* lockDefaultRangeSplitRelations */
    LOCK TABLE ${lockTables.join(', ')} IN ACCESS EXCLUSIVE MODE`)
  const locked = await readDefaultRangeCatalog(query, table)
  const lockedReferences = await readReferencingForeignKeys(query, table)
  if (
    locked.partitionName !== initial.partitionName ||
    JSON.stringify(lockedReferences) !== JSON.stringify(references) ||
    locked.partitionKey !== `RANGE (${key})`
  ) {
    throw new Error(`${table} partition catalog changed while acquiring the operator lock`)
  }
  const deleteGuards = await readDeleteGuards(query, locked.partitionName)
  const approved = APPROVED_STRUCTURAL_DELETE_TRIGGERS[table] ?? {}
  if (
    deleteGuards.some(guard => approved[guard.name] !== guard.functionName || !guard.functionLocal)
  ) {
    throw new Error(
      `${table} has an unreviewed DELETE trigger; its owner must define a safe row-move path`,
    )
  }
  await assertNoDirectChildForeignKeys(query, locked.partitionName)
  await assertLeadingRangeIndex(query, locked.partitionName, key)
  const { rows: counts } = await query<{ row_count: number }>(
    `/* countBoundedDefaultRangeRows */
    SELECT count(*)::int AS row_count FROM (
      SELECT 1 FROM ${locked.partitionName} LIMIT $1
    ) bounded`,
    [MAX_DEFAULT_SCAN_ROWS + 1],
  )
  if ((counts[0]?.row_count ?? 0) > MAX_DEFAULT_SCAN_ROWS) {
    throw new Error(`${table} DEFAULT exceeds the ${MAX_DEFAULT_SCAN_ROWS} row scan cap`)
  }
  for (const child of [...new Set(lockedReferences.map(ref => ref.table_name))]) {
    // no-mistakes-disable-next-line query-reached-per-item: each reviewed FK child has a hard 100000-row admission cap
    const { rows } = await query<{ row_count: number }>(
      `/* countBoundedForeignKeyRevalidationRows */
      SELECT count(*)::int AS row_count FROM (
        SELECT 1 FROM ${child} LIMIT $1
      ) bounded`,
      [MAX_FK_REVALIDATION_ROWS + 1],
    )
    if ((rows[0]?.row_count ?? 0) > MAX_FK_REVALIDATION_ROWS) {
      throw new Error(`${child} exceeds the ${MAX_FK_REVALIDATION_ROWS} row FK revalidation cap`)
    }
  }
  const { rows: selected } = await query<{ row_count: number }>(
    `/* countBoundedRangeMoveRows */
    SELECT count(*)::int AS row_count FROM (
      SELECT 1 FROM ${locked.partitionName}
      WHERE ${key} >= $1::uuid AND ${key} < $2::uuid
      ORDER BY ${key} LIMIT $3
    ) bounded`,
    [input.fromId, input.toId, input.maxRows + 1],
  )
  const moved = selected[0]?.row_count ?? 0
  if (moved > input.maxRows)
    throw new Error(`${table} range exceeds the ${input.maxRows} row move cap`)
  const columns = (await readCopyableColumns(query, table)).join(', ')
  for (const reference of lockedReferences) {
    // no-mistakes-disable-next-line query-reached-per-item: reviewed FKs must be changed serially on one DDL transaction
    await query(`/* suspendDefaultRangeForeignKey */ ALTER TABLE ${reference.table_name}
      DROP CONSTRAINT ${reference.constraint_name}`)
  }
  await query(`/* createStandaloneRangeChild */ CREATE TABLE ${name} (LIKE ${table} INCLUDING ALL)`)
  await query(
    `/* copyDefaultRangeRows */ INSERT INTO ${name} (${columns}) OVERRIDING SYSTEM VALUE
    SELECT ${columns} FROM ${locked.partitionName}
    WHERE ${key} >= $1::uuid AND ${key} < $2::uuid`,
    [input.fromId, input.toId],
  )
  for (const guard of deleteGuards) {
    if (guard.enabled === 'D') continue
    // no-mistakes-disable-next-line query-reached-per-item: only exact approved guards pause under the exclusive lock
    await query(`/* suspendStructuralMoveDeleteGuard */ ALTER TABLE ${locked.partitionName}
      DISABLE TRIGGER ${guard.name}`)
  }
  await query(
    `/* removeMovedDefaultRangeRows */ DELETE FROM ${locked.partitionName}
    WHERE ${key} >= $1::uuid AND ${key} < $2::uuid`,
    [input.fromId, input.toId],
  )
  for (const guard of deleteGuards) {
    if (guard.enabled === 'D') continue
    const mode = guard.enabled === 'A' ? 'ALWAYS' : guard.enabled === 'R' ? 'REPLICA' : ''
    // no-mistakes-disable-next-line query-reached-per-item: restore exact known trigger modes before attach
    await query(`/* restoreStructuralMoveDeleteGuard */ ALTER TABLE ${locked.partitionName}
      ENABLE ${mode} TRIGGER ${guard.name}`)
  }
  await query(`/* attachExplicitRange */ ALTER TABLE ${table} ATTACH PARTITION ${name}
    FOR VALUES FROM ('${input.fromId}') TO ('${input.toId}')`)
  for (const reference of lockedReferences) {
    // no-mistakes-disable-next-line query-reached-per-item: reviewed FKs revalidate serially on one DDL transaction
    await query(`/* restoreDefaultRangeForeignKey */ ALTER TABLE ${reference.table_name}
      ADD CONSTRAINT ${reference.constraint_name} ${reference.definition}`)
  }
  await query.commit()
  return { moved, name }
}
/* oxlint-enable no-await-in-loop */

async function assertLeadingRangeIndex(query: TransactionQuery, partition: string, key: string) {
  const { rows } = await query(
    `/* assertLeadingRangeIndex */
    SELECT 1 FROM pg_index index_data
    JOIN pg_class relation ON relation.oid = index_data.indrelid
    JOIN pg_namespace ns ON ns.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      AND attribute.attnum = index_data.indkey[0]
    WHERE ns.nspname = current_schema() AND relation.relname = $1 AND attribute.attname = $2
      AND index_data.indisvalid AND index_data.indisready LIMIT 1`,
    [partition, key],
  )
  if (rows.length === 0) throw new Error(`${partition} needs a leading ${key} index`)
}
