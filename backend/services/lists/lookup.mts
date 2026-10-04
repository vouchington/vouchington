import { read } from '@data-stores/psql'
import { getListItemStorageConfig } from './catalog.mts'
import type { ListItemType } from './types.mts'

export async function getListsContainingEntity(
  ownerUserId: string,
  itemType: ListItemType,
  entityId: string,
  options: { includePrivate?: boolean } = {},
): Promise<string[]> {
  const { table, entityColumn } = getListItemStorageConfig(itemType)
  // Private lists are included unless the caller leaves them out; the filter runs in SQL.
  const privateFilter = options.includePrivate === false ? `AND l.visibility <> 'private'` : ''

  const { rows } = await read(
    `/* getListsContainingEntity */
    SELECT l.id
    FROM lists l
    JOIN ${table} li ON li.list_id = l.id
    WHERE l.owner_user_id = $1
      AND l.removed_at IS NULL
      ${privateFilter}
      AND li.${entityColumn} = $2
      AND li.removed_at IS NULL
    ORDER BY l.id DESC
    `,
    [ownerUserId, entityId],
  )

  return rows.map(row => row.id as string)
}
