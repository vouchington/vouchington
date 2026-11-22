type StoredRelationRow = { direction: string }

/** Inserts both stored directions and partitions returned rows. */
export async function insertBidirectionalRelationRows<T>(
  insertRows: () => Promise<{ rows: unknown[] }>,
): Promise<{ relations: T[]; reverseRelations: T[] }> {
  const { rows } = await insertRows()
  const relations: T[] = []
  const reverseRelations: T[] = []
  for (const row of rows as Array<T & StoredRelationRow>) {
    const { direction, ...stored } = row
    if (direction === 'reverse') reverseRelations.push(stored as T)
    else relations.push(stored as T)
  }
  return { relations, reverseRelations }
}
