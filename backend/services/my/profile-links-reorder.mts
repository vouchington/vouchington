import { read, write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export async function reorderProfileLinks(userId: string, orderedIds: string[]): Promise<void> {
  assert(orderedIds.length > 0, 400, 'orderedIds must not be empty')
  const { rows } = await read(
    sql`/* reorderProfileLinks */ SELECT id FROM user_profile_links WHERE user_id = ${userId}`,
  )
  const existingIds = new Set(rows.map((r: { id: string }) => r.id))
  assert(
    orderedIds.length === existingIds.size,
    400,
    'All profile links must be included in the reorder',
  )
  for (const id of orderedIds) assert(existingIds.has(id), 400, `Link ${id} not found`)
  const sortOrders = orderedIds.map((_, i) => i)
  await write(sql`/* reorderProfileLinks */
    UPDATE user_profile_links
    SET sort_order = ordering.sort_order
    FROM (
      SELECT UNNEST(${orderedIds}::uuid[]) AS id, UNNEST(${sortOrders}::bigint[]) AS sort_order
    ) AS ordering
    WHERE user_profile_links.id = ordering.id
      AND user_profile_links.user_id = ${userId}
  `)
}
