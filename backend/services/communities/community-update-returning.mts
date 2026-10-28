import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  mapCommunityWithOwner,
  type CommunityRowWithOwner,
  type CommunityWithOwner,
} from './get-mapping.mts'
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

export async function writeCommunityUpdate(
  annotation: SQLStatement,
  update: SQLStatement,
  options?: QueryOptions,
): Promise<CommunityWithOwner | null> {
  const [updated] = await writeCommunitiesUpdate(annotation, update, options)
  return updated ?? null
}

export async function writeCommunitiesUpdate(
  annotation: SQLStatement,
  update: SQLStatement,
  options?: QueryOptions,
): Promise<CommunityWithOwner[]> {
  const statement = communityUpdateReturning(annotation, update)
  const { rows } = options?.query
    ? await options.query<CommunityRowWithOwner>(statement.text, statement.values)
    : await write<CommunityRowWithOwner>(statement.text, statement.values, options)
  return rows.map(mapCommunityWithOwner)
}
