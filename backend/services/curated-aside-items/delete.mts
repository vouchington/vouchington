import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { currentUserCanManageCuratedAsides } from './authorization.mts'
import type { PrivateUser } from '@services/users/types'

export async function deleteCuratedItem(currentUser: PrivateUser, itemId: string): Promise<void> {
  if (!currentUserCanManageCuratedAsides(currentUser)) {
    throw createHttpError(403, 'Forbidden')
  }

  await write(sql`/* deleteCuratedItem */
    UPDATE curated_aside_items
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${itemId}
      AND deleted_at IS NULL
  `)
}
