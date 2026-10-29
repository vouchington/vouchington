import type { ListItem, ListItemType } from './types.mts'
import assert from 'node:assert/strict'

export function rowToListItem(row: Record<string, unknown>, itemType: ListItemType): ListItem {
  const entityLabel = row.entity_label
  assert(typeof entityLabel === 'string', 'List item is missing its entity label')
  return {
    __entity_type: 'list_item',
    id: row.id as string,
    list_id: row.list_id as string,
    item_type: itemType,
    entity_id: row.entity_id as string,
    order_index: (row.order_index as number) ?? 0,
    created_at: row.created_at as Date,
    media_type: (row.media_type as string | null) ?? null,
    entity_label: entityLabel,
  }
}
