import sql, { type SQLStatement } from 'sql-template-strings'
import type { QueryExecutor } from './types.mts'

/** Order an existing retention page against account hold placement before its DELETE snapshot. */
export async function lockRetentionPreservationAccounts(
  query: QueryExecutor,
  accountIds: SQLStatement,
): Promise<void> {
  const statement = sql`
    SELECT users.id FROM users
    WHERE users.id IN (`
  statement.append(accountIds).append(sql`)
    ORDER BY users.id
    -- lock-reason: prevents: deleting a record whose account hold commits mid-retention; writer: preservation hold placement (users FOR NO KEY UPDATE).
    FOR SHARE`)
  await query(`/* lockRetentionPreservationAccounts */${statement.text}`, statement.values)
}
