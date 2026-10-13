import sql, { type SQLStatement } from 'sql-template-strings'
import { communityColumns } from './columns.mts'
import { buildCommunityImagePlacementSelect } from './search/image-placements.mts'

/**
 * Completes an annotated `SELECT ` with the community detail projection and its FROM clause.
 * `extra` adds select-list columns and joins in textual order, so bound values stay aligned.
 */
export function selectCommunityWithOwner(
  select: SQLStatement,
  extra?: { columns: SQLStatement; join: SQLStatement },
): SQLStatement {
  const statement = select
    .append(communityColumns('c'))
    .append(
      ', u.id AS owner_id, u.username AS owner_username, (SELECT e.account_type FROM view_embedded_users e WHERE e.id = u.id) AS owner_account_type',
    )
    .append(buildCommunityImagePlacementSelect())
  if (extra) statement.append(extra.columns)
  statement.append(sql` FROM communities c LEFT JOIN users u ON u.id = c.created_by_id`)
  if (extra) statement.append(extra.join)
  return statement
}
