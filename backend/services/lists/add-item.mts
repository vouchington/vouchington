import { write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { invalidate } from '@services/entity-cache/invalidate'
import assert from 'http-assert'
import { getListItemStorageConfig } from './catalog.mts'
import { itemFactsSql } from './item-facts.mts'
import { rowToListItem } from './item-row.mts'
import type { ListItem, ListItemType } from './types.mts'

export async function addListItem(
  listId: string,
  itemType: ListItemType,
  entityId: string,
): Promise<ListItem> {
  const { table, entityColumn } = getListItemStorageConfig(itemType)
  assert(table && entityColumn, 500, 'unknown item type')
  assert(isUUID(entityId), 422, 'Invalid entity ID format')
  const entityFacts = itemFactsSql(itemType)

  const { rows } = await write(
    `/* addListItem */
    WITH entity_facts AS (${entityFacts}),
    inserted AS (
      -- Dynamic table and column come from the closed list-item storage catalog.
      /* no-mistakes: deadlock-safe */
      INSERT INTO ${table} (user_list_id, ${entityColumn})
      SELECT $1::uuid, entity_id FROM entity_facts
      RETURNING id, user_list_id AS list_id, ${entityColumn} AS entity_id, order_index, created_at
    )
    SELECT inserted.*, entity_facts.media_type, entity_facts.entity_label
    FROM inserted JOIN entity_facts USING (entity_id)
    `,
    [listId, entityId],
  ).catch(async (err: unknown) => {
    const code = (err as { code?: string }).code
    if (code === '23505') {
      // write() not read() to avoid replica-lag race on immediate re-add
      return write(
        `/* addListItem:existing */
        WITH entity_facts AS (${entityFacts})
        SELECT li.id, li.user_list_id AS list_id, li.${entityColumn} AS entity_id,
          li.order_index, li.created_at, entity_facts.media_type, entity_facts.entity_label
        FROM ${table} li JOIN entity_facts ON entity_facts.entity_id = li.${entityColumn}
        WHERE li.user_list_id = $1::uuid
          AND li.${entityColumn} = $2::uuid
          AND li.removed_at IS NULL
        LIMIT 1
        `,
        [listId, entityId],
      )
    }
    if (code === '23503') assert(false, 404, 'Referenced list or entity does not exist')
    if (code === '22P02') assert(false, 422, 'Invalid entity ID format')
    throw err
  })

  assert(rows[0], 404, 'Referenced list or entity does not exist')
  const item = rowToListItem(rows[0], itemType)
  await invalidate.lists(listId)
  return item
}
