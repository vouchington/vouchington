import sql, { type SQLStatement } from 'sql-template-strings'
import { selectCommunityWithOwner } from './select-community.mts'

/** One statement: the community UPDATE and the owner projection it returns. */
export function communityUpdateReturning(
  annotation: SQLStatement,
  update: SQLStatement,
): SQLStatement {
  const statement = annotation.append(sql` WITH updated AS (`)
  statement.append(update)
  statement.append(sql` RETURNING *) `)
  return selectCommunityWithOwner(
    statement.append(sql`SELECT `),
    undefined,
    sql` FROM updated c LEFT JOIN users u ON u.id = c.created_by_id`,
  )
}
