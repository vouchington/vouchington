import type { TransactionQuery } from '@data-stores/psql'
import type { SQLStatement } from 'sql-template-strings'

type StoredRelationRow = { direction?: string; ordinality?: unknown }

/** Inserts both stored directions in the statement `lockBidirectionalRelationPairs` already serializes. */
export async function insertBidirectionalRelationRows<T>(
  query: TransactionQuery,
  statement: SQLStatement,
): Promise<{ relations: T[]; reverseRelations: T[] }> {
  const { rows } = await query(statement)
  const relations: T[] = []
  const reverseRelations: T[] = []
  for (const row of rows as Array<T & StoredRelationRow>) {
    const { direction, ordinality: _ordinality, ...stored } = row
    if (direction === 'reverse') reverseRelations.push(stored as T)
    else relations.push(stored as T)
  }
  return { relations, reverseRelations }
}
