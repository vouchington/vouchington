import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'

export type UserReference = { id: string; username: string | null; slug: null }

/** User id or username, in one statement. A user with no username resolves only by id. */
export async function getUsersByReferenceBatch(
  references: readonly string[],
): Promise<Array<UserReference | null>> {
  const ids: string[] = []
  const idOrders: number[] = []
  const names: string[] = []
  const nameOrders: number[] = []
  references.forEach((reference, index) => {
    const trimmed = reference.trim()
    if (!trimmed) return
    if (isUUID(trimmed)) {
      ids.push(trimmed)
      idOrders.push(index)
      return
    }
    names.push(trimmed.toLowerCase())
    nameOrders.push(index)
  })
  const results: Array<UserReference | null> = references.map(() => null)
  if (ids.length + names.length === 0) return results
  const { rows } = await read<{
    id: string
    username: string | null
    input_order: number
  }>(
    `/* getUsersByReferenceBatch */
    WITH id_input AS (
      SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS input_order
    ),
    name_input AS (
      SELECT unnest($3::text[]) AS username, unnest($4::int[]) AS input_order
    ),
    hits AS (
      SELECT users.id, users.username, id_input.input_order, 0 AS priority
      FROM users
      JOIN id_input ON users.id = id_input.id
      WHERE users.deleted_at IS NULL
      UNION ALL
      SELECT users.id, users.username, name_input.input_order, 1 AS priority
      FROM users
      JOIN name_input ON LOWER(users.username) = name_input.username
      WHERE users.deleted_at IS NULL AND users.username IS NOT NULL
    )
    SELECT DISTINCT ON (input_order) id, username, input_order
    FROM hits
    ORDER BY input_order, priority, id`,
    [ids, idOrders, names, nameOrders],
  )
  for (const row of rows) {
    results[row.input_order] = { id: row.id, username: row.username, slug: null }
  }
  return results
}
