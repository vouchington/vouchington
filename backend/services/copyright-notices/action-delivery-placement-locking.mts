import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Copyright availability is shared by grounds from different cases. Own the affected placements
 * before ending a ground and read remaining grounds in a new statement after any wait.
 */
export async function lockCopyrightPlacementTransitions(
  placementIds: readonly string[],
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockCopyrightPlacementTransitions */
    SELECT id FROM media_placements WHERE id = ANY(${placementIds}::uuid[])
    ORDER BY id FOR UPDATE
  `)
}
