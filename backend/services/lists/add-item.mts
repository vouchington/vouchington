import { write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import { getListItemStorageConfig } from './catalog.mts'
import { itemFactsSql } from './item-facts.mts'
import { rowToListItem } from './item-row.mts'
import type { ListItem, ListItemType } from './types.mts'

/**
 * Adds every existing entity in one INSERT and returns the active list item per entity id.
 * Entities already on the list return their existing row; unknown entities are absent.
 */
export async function addListItems(
  listId: string,
  itemType: ListItemType,
  entityIds: readonly string[],
): Promise<Map<string, ListItem>> {
  const { table, entityColumn } = getListItemStorageConfig(itemType)
  assert(table && entityColumn, 500, 'unknown item type')
  assert(entityIds.every(isUUID), 422, 'Invalid entity ID format')
  const ids = [...new Set(entityIds.map(id => id.toLowerCase()))].toSorted()
  const items = new Map<string, ListItem>()
  if (ids.length === 0) return items
  const entityFacts = itemFactsSql(itemType)

  const insertBatch = () =>
    write(
      `/* addListItem */
    WITH entity_facts AS (${entityFacts}),
    inserted AS (
      -- Dynamic table and column come from the closed list-item storage catalog.
      /* no-mistakes: deadlock-safe */
      INSERT INTO ${table} (user_list_id, ${entityColumn})
      SELECT $1::uuid, entity_id FROM entity_facts ORDER BY entity_id
      ON CONFLICT (user_list_id, ${entityColumn}) WHERE removed_at IS NULL DO NOTHING
      RETURNING id, user_list_id AS list_id, ${entityColumn} AS entity_id, order_index, created_at
    )
    SELECT inserted.*, entity_facts.media_type, entity_facts.entity_label,
      entity_facts.label_markdown, entity_facts.label_summary
    FROM inserted JOIN entity_facts USING (entity_id)
    `,
      [listId, ids],
    )
  // An entity deleted after the statement's snapshot fails the whole batch's FK check; one retry
  // re-reads the snapshot without it, so surviving siblings still insert. A repeat means the list is gone.
  const inserted = await insertBatch()
    .catch((err: unknown) => {
      if ((err as { code?: string }).code !== '23503') throw err
      return insertBatch()
    })
    .catch((err: unknown) => {
      const code = (err as { code?: string }).code
      if (code === '23503') assert(false, 404, 'Referenced list or entity does not exist')
      if (code === '22P02') assert(false, 422, 'Invalid entity ID format')
      throw err
    })
  for (const row of inserted.rows) items.set(row.entity_id as string, rowToListItem(row, itemType))

  const existingIds = ids.filter(id => !items.has(id))
  if (existingIds.length > 0) {
    // write() not read() to avoid replica-lag race on immediate re-add
    const { rows } = await write(
      `/* addListItem:existing */
      WITH entity_facts AS (${entityFacts})
      SELECT li.id, li.user_list_id AS list_id, li.${entityColumn} AS entity_id,
        li.order_index, li.created_at, entity_facts.media_type, entity_facts.entity_label,
        entity_facts.label_markdown, entity_facts.label_summary
      FROM ${table} li JOIN entity_facts ON entity_facts.entity_id = li.${entityColumn}
      WHERE li.user_list_id = $1::uuid
        AND li.${entityColumn} = ANY($2::uuid[])
        AND li.removed_at IS NULL
      `,
      [listId, existingIds],
    )
    for (const row of rows) items.set(row.entity_id as string, rowToListItem(row, itemType))
  }

  return items
}

export async function addListItem(
  listId: string,
  itemType: ListItemType,
  entityId: string,
): Promise<ListItem> {
  const item = (await addListItems(listId, itemType, [entityId])).get(entityId.toLowerCase())
  assert(item, 404, 'Referenced list or entity does not exist')
  return item
}
