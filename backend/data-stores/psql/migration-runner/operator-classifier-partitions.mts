/* oxlint-disable no-await-in-loop -- each partition DDL step depends on the prior step on one transaction connection. */
import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import { CLASSIFIER_RESULT_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import { beginBoundedTransaction } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import {
  CLASSIFIER_PARTITION_MAX_TOTAL_ROWS,
  parseClassifierPartitionRange,
  type ClassifierPartitionRangeInput,
} from './classifier-partition-range.mts'

const TABLES = CLASSIFIER_RESULT_PARTITION_TABLES.map(table => assertSafeSqlIdentifier(table))
const CONNECTION_TIMEOUT_MS = 5_000
const STATEMENT_TIMEOUT_MS = 15_000

type Child = { parent_table: string; partition_name: string; partition_bound: string }
type DefaultRow = { parent_table: string; batch_id: string; inside_range: boolean }

/** Reuse the three physical DEFAULT tables as one aligned range; never move immutable result rows. */
export async function createClassifierResultRange(
  input: ClassifierPartitionRangeInput,
): Promise<void> {
  const range = parseClassifierPartitionRange(input)
  const nextUtcDay = new Date()
  nextUtcDay.setUTCHours(24, 0, 0, 0)
  if (range.toDate > nextUtcDay) {
    throw new Error('Classifier result ranges cannot be created ahead of observed data')
  }
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: STATEMENT_TIMEOUT_MS,
  })
  await transaction(
    `/* createClassifierResultRange:lockBudget */ SET LOCAL lock_timeout = '2000ms'`,
  )
  await lockClassifierResultParents(transaction)
  const children = await readClassifierChildren(transaction, range.nameSuffix)
  if (allRangesAttached(children, range.nameSuffix, range.fromId, range.toId)) {
    assertEveryDefaultAttached(children)
    await transaction.commit()
    return
  }
  if (children.some(child => child.partition_name.endsWith(`__${range.nameSuffix}`))) {
    throw new Error('Classifier partition range is only partly attached')
  }
  assertEveryDefaultAttached(children)
  await assertDefaultsFitRange(transaction, range.fromId, range.toId, range.maxDefaultRows)

  // The candidate FK target stays unpartitioned. All DDL and FK validation commit together;
  // failure restores every DEFAULT without moving immutable result rows.
  for (const table of TABLES) {
    await transaction(`/* createClassifierResultRange:detach */
      ALTER TABLE ${table} DETACH PARTITION ${table}__default`)
  }
  for (const table of TABLES) {
    await transaction(`/* createClassifierResultRange:rename */
      ALTER TABLE ${table}__default RENAME TO ${table}__${range.nameSuffix}`)
  }
  for (const table of TABLES) {
    await transaction(`/* createClassifierResultRange:attach */
      ALTER TABLE ${table} ATTACH PARTITION ${table}__${range.nameSuffix}
      FOR VALUES FROM ('${range.fromId}') TO ('${range.toId}')`)
  }
  for (const table of TABLES) {
    await transaction(`/* createClassifierResultRange:newDefault */
      CREATE TABLE ${table}__default PARTITION OF ${table} DEFAULT`)
  }
  await transaction.commit()
}

async function lockClassifierResultParents(query: QueryExecutor): Promise<void> {
  await query(`/* lockClassifierResultParents */
    LOCK TABLE ${TABLES.join(', ')} IN ACCESS EXCLUSIVE MODE`)
}

async function readClassifierChildren(query: QueryExecutor, nameSuffix: string): Promise<Child[]> {
  const names = TABLES.flatMap(table => [`${table}__default`, `${table}__${nameSuffix}`])
  const { rows } = await query<Child>(
    `/* readClassifierChildren */
    SELECT parent.relname AS parent_table, child.relname AS partition_name,
      pg_get_expr(child.relpartbound, child.oid) AS partition_bound
    FROM pg_class AS child
    JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_inherits AS inheritance ON inheritance.inhrelid = child.oid
    JOIN pg_class AS parent ON parent.oid = inheritance.inhparent
    JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE child_ns.nspname = current_schema() AND parent_ns.nspname = current_schema()
      AND child.relname = ANY($1::text[])
      AND parent.relname = ANY($2::text[])`,
    [names, TABLES],
  )
  return rows
}

function allRangesAttached(
  children: readonly Child[],
  nameSuffix: string,
  fromId: string,
  toId: string,
): boolean {
  const matches = children.filter(child => child.partition_name.endsWith(`__${nameSuffix}`))
  if (matches.length === 0) return false
  if (matches.length !== TABLES.length) throw new Error('Classifier partition range is incomplete')
  const byParent = new Map(matches.map(child => [child.parent_table, child]))
  for (const table of TABLES) {
    const child = byParent.get(table)
    if (
      child?.partition_name !== `${table}__${nameSuffix}` ||
      !child.partition_bound.includes(fromId) ||
      !child.partition_bound.includes(toId)
    ) {
      throw new Error('Classifier partition range has unexpected bounds')
    }
  }
  return true
}

function assertEveryDefaultAttached(children: readonly Child[]): void {
  for (const table of TABLES) {
    if (
      !children.some(
        child => child.parent_table === table && child.partition_name === `${table}__default`,
      )
    ) {
      throw new Error(`Classifier result DEFAULT is missing for ${table}`)
    }
  }
}

async function assertDefaultsFitRange(
  query: QueryExecutor,
  fromId: string,
  toId: string,
  maxDefaultRows: number,
): Promise<void> {
  const samples = TABLES.map(
    table => `
    SELECT '${table}'::text AS parent_table, batch_id,
      batch_id >= $2::uuid AND batch_id < $3::uuid AS inside_range
    FROM (SELECT batch_id FROM ONLY ${table}__default
      ORDER BY batch_id LIMIT $1) AS sample`,
  )
  const { rows } = await query<DefaultRow>(
    `/* assertDefaultsFitRange */ ${samples.join(' UNION ALL ')}`,
    [maxDefaultRows + 1, fromId, toId],
  )
  if (rows.length > CLASSIFIER_PARTITION_MAX_TOTAL_ROWS) {
    throw new Error('Classifier result DEFAULT total row cap exceeded')
  }
  if (rows.length === 0) {
    throw new Error('Classifier result DEFAULT has no rows to split into a range')
  }
  for (const table of TABLES) {
    const selected = rows.filter(row => row.parent_table === table)
    if (selected.length > maxDefaultRows) {
      throw new Error(`Classifier result DEFAULT row cap exceeded for ${table}`)
    }
    if (selected.some(row => !row.inside_range)) {
      throw new Error(`Classifier result DEFAULT extends outside the requested range for ${table}`)
    }
  }
}
