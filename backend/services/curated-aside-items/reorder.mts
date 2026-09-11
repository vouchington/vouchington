import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { currentUserCanManageCuratedAsides } from './authorization.mts'
import type { PrivateUser } from '@services/users/types'

export async function reorderCuratedItems(
  currentUser: PrivateUser,
  asideType: string,
  itemIds: string[],
): Promise<void> {
  if (!currentUserCanManageCuratedAsides(currentUser)) {
    throw createHttpError(403, 'Forbidden')
  }

  if (itemIds.length === 0) return

  const positions = itemIds.map((_, i) => i)
  await using query = await beginTransaction()
  // Pre-lock in ascending id order to prevent ABBA deadlocks when concurrent
  // reorder requests touch overlapping item sets in different orderings.
  await write(
    sql`/* reorderCuratedItems lockRows */
      SELECT id FROM curated_aside_items
      WHERE id = ANY(${itemIds}::uuid[])
        AND aside_type = ${asideType}
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE
    `,
    { query },
  )
  await write(
    sql`/* reorderCuratedItems */
      UPDATE curated_aside_items
      SET position = ordering.position
      FROM UNNEST(${itemIds}::uuid[], ${positions}::smallint[]) AS ordering(id, position)
      WHERE curated_aside_items.id = ordering.id
        AND curated_aside_items.aside_type = ${asideType}
        AND curated_aside_items.deleted_at IS NULL
    `,
    { query },
  )

  await query.commit()
}
