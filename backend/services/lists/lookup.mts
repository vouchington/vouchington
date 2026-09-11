import { read } from '@data-stores/psql'
import { getListItemStorageConfig } from './catalog.mts'
import type { ListItemType } from './types.mts'

export async function getListsContainingEntity(
  ownerUserId: string,
  itemType: ListItemType,
  entityId: string,
): Promise<string[]> {
  const { table, entityColumn } = getListItemStorageConfig(itemType)

  const { rows } = await read(
    `/* getListsContainingEntity */
    SELECT l.id
    FROM lists l
    JOIN ${table} li ON li.list_id = l.id
    WHERE l.owner_user_id = $1
      AND l.removed_at IS NULL
      AND li.${entityColumn} = $2
      AND li.removed_at IS NULL
    ORDER BY l.created_at DESC
    `,
    [ownerUserId, entityId],
  )

  return rows.map(row => row.id as string)
}
