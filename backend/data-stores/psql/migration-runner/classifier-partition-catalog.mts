import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import { CLASSIFIER_RESULT_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import type { QueryExecutor } from '../types.mts'
import {
  CLASSIFIER_PARTITION_MAX_TOTAL_ROWS,
  matchesClassifierPartitionBound,
} from './classifier-partition-range.mts'

export const CLASSIFIER_RESULT_TABLES = CLASSIFIER_RESULT_PARTITION_TABLES.map(table =>
  assertSafeSqlIdentifier(table),
)

export type ClassifierChild = {
  parent_table: string | null
  partition_name: string
  partition_bound: string | null
}

export async function readClassifierChildren(
  query: QueryExecutor,
  nameSuffix: string,
): Promise<ClassifierChild[]> {
  const names = CLASSIFIER_RESULT_TABLES.flatMap(table => [
    `${table}__default`,
    `${table}__${nameSuffix}`,
  ])
  const { rows } = await query<ClassifierChild>(
    `/* readClassifierChildren */
    SELECT parent.relname AS parent_table, child.relname AS partition_name,
      pg_get_expr(child.relpartbound, child.oid) AS partition_bound
    FROM pg_class AS child
    JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    LEFT JOIN pg_inherits AS inheritance ON inheritance.inhrelid = child.oid
    LEFT JOIN pg_class AS parent ON parent.oid = inheritance.inhparent
    WHERE child_ns.nspname = current_schema()
      AND child.relname = ANY($1::text[])`,
    [names],
  )
  return rows
}

export function allRangesAttached(
  children: readonly ClassifierChild[],
  nameSuffix: string,
  fromId: string,
  toId: string,
): boolean {
  const matches = children.filter(child => child.partition_name.endsWith(`__${nameSuffix}`))
  if (matches.length === 0) return false
  if (matches.length !== CLASSIFIER_RESULT_TABLES.length) {
    throw new Error('Classifier partition range is incomplete')
  }
  const byParent = new Map(matches.map(child => [child.parent_table, child]))
  for (const table of CLASSIFIER_RESULT_TABLES) {
    const child = byParent.get(table)
    if (
      child?.partition_name !== `${table}__${nameSuffix}` ||
      !child.partition_bound ||
      !matchesClassifierPartitionBound(child.partition_bound, fromId, toId)
    ) {
      throw new Error('Classifier partition range has unexpected bounds')
    }
  }
  return true
}

export function assertAllRangesAttached(
  children: readonly ClassifierChild[],
  nameSuffix: string,
  fromId: string,
  toId: string,
): void {
  if (!allRangesAttached(children, nameSuffix, fromId, toId)) {
    throw new Error('Classifier partition range is incomplete')
  }
}

export function assertEveryDefaultAttached(children: readonly ClassifierChild[]): void {
  for (const table of CLASSIFIER_RESULT_TABLES) {
    if (
      !children.some(
        child => child.parent_table === table && child.partition_name === `${table}__default`,
      )
    ) {
      throw new Error(`Classifier result DEFAULT is missing for ${table}`)
    }
  }
}

export async function lockClassifierResultParents(query: QueryExecutor): Promise<void> {
  await query(`/* lockClassifierResultParents */
    LOCK TABLE ${CLASSIFIER_RESULT_TABLES.join(', ')} IN ACCESS EXCLUSIVE MODE`)
}

type DefaultRow = { parent_table: string; batch_id: string; inside_range: boolean }

export async function assertDefaultsFitRange(
  query: QueryExecutor,
  fromId: string,
  toId: string,
  maxDefaultRows: number,
): Promise<void> {
  const samples = CLASSIFIER_RESULT_TABLES.map(
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
  for (const table of CLASSIFIER_RESULT_TABLES) {
    const selected = rows.filter(row => row.parent_table === table)
    if (selected.length > maxDefaultRows) {
      throw new Error(`Classifier result DEFAULT row cap exceeded for ${table}`)
    }
    if (selected.some(row => !row.inside_range)) {
      throw new Error(`Classifier result DEFAULT extends outside the requested range for ${table}`)
    }
  }
}
