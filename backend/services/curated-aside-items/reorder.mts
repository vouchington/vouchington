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
  if (itemIds.length === 1) {
    await write(sql`/* reorderCuratedItems */
      UPDATE curated_aside_items
      SET position = 0
      WHERE id = ${itemIds[0]}
        AND aside_type = ${asideType}
        AND deleted_at IS NULL
    `)
    return
  }

  const positions = itemIds.map((_, i) => i)
  await using query = await beginTransaction()
  await query(
    sql`/* reorderCuratedItems lockRows */
      SELECT id FROM curated_aside_items
      WHERE id = ANY(${itemIds}::uuid[])
        AND aside_type = ${asideType}
        AND deleted_at IS NULL
      ORDER BY id
      -- lock-reason: prevents: ABBA deadlock when concurrent multi-item reorders overlap in different orders; writer: reorderCuratedItems
      FOR UPDATE
    `,
  )
  await query(
    sql`/* reorderCuratedItems */
      UPDATE curated_aside_items
      SET position = ordering.position
      FROM UNNEST(${itemIds}::uuid[], ${positions}::smallint[]) AS ordering(id, position)
      WHERE curated_aside_items.id = ordering.id
        AND curated_aside_items.aside_type = ${asideType}
        AND curated_aside_items.deleted_at IS NULL
    `,
  )

  await query.commit()
}
