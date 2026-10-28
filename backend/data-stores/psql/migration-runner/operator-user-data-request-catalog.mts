import type { QueryExecutor } from '../types.mts'
import { matchesClassifierPartitionBound } from './classifier-partition-range.mts'

export const REQUESTS = 'user_data_requests'
export const ATTEMPTS = 'user_data_request_attempts'
export const TABLES = [REQUESTS, ATTEMPTS] as const

type Child = { parent_table: string | null; partition_name: string; partition_bound: string | null }

export async function readChildren(query: QueryExecutor, suffix: string): Promise<Child[]> {
  const names = TABLES.flatMap(table => [`${table}__default`, `${table}__${suffix}`])
  const { rows } = await query<Child>(
    `/* readUserDataRequestPartitionChildren */
    SELECT parent.relname AS parent_table, child.relname AS partition_name,
      pg_get_expr(child.relpartbound, child.oid) AS partition_bound
    FROM pg_class child
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    LEFT JOIN pg_inherits inheritance ON inheritance.inhrelid = child.oid
    LEFT JOIN pg_class parent ON parent.oid = inheritance.inhparent
    WHERE child_ns.nspname = current_schema() AND child.relname = ANY($1::text[])`,
    [names],
  )
  return rows
}

export function assertDefaults(children: readonly Child[]): void {
  for (const table of TABLES) {
    if (
      !children.some(
        child => child.parent_table === table && child.partition_name === `${table}__default`,
      )
    ) {
      throw new Error(`Request history DEFAULT is missing for ${table}`)
    }
  }
}

export function attachedRangeCount(
  children: readonly Child[],
  suffix: string,
  fromId: string,
  toId: string,
): number {
  let count = 0
  const byName = new Map(children.map(child => [child.partition_name, child]))
  for (const table of TABLES) {
    const child = byName.get(`${table}__${suffix}`)
    if (!child) continue
    if (
      child.parent_table !== table ||
      !child.partition_bound ||
      !matchesClassifierPartitionBound(child.partition_bound, fromId, toId)
    ) {
      throw new Error(`Request history range has unexpected bounds for ${table}`)
    }
    count++
  }
  return count
}
