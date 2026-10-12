import sql from './fixture-sql.mts'
import type { SQLStatement } from 'sql-template-strings'

export function createPrioritizedReferralLinksBaseQueryForTest(): SQLStatement {
  return sql`WITH ranked AS (SELECT 1`
}
