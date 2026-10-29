import { read, type QueryExecutor } from '@data-stores/psql'
import type { SQLStatement } from 'sql-template-strings'

/** One query for the bounded input page; preserve its ordering and every caller-owned field. */
export async function attachIntegrityLabelRows<
  T extends { id: string },
  F extends { id: string },
  L extends object,
>(
  items: T[],
  statement: (ids: string[]) => SQLStatement,
  labels: (fact: F | undefined, item: T) => L,
  query: QueryExecutor = read,
): Promise<Array<T & L>> {
  if (items.length === 0) return []
  const { rows } = await query<F>(statement(items.map(item => item.id)))
  const byId = new Map(rows.map(row => [row.id, row]))
  return items.map(item => ({ ...item, ...labels(byId.get(item.id), item) }))
}
