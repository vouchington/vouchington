import type { ListItem, ListItemType } from './types.mts'
import assert from 'node:assert/strict'
import { generateExcerpt } from '@vouchington/utils/format'

export function rowToListItem(row: Record<string, unknown>, itemType: ListItemType): ListItem {
  const entityLabel = row.entity_label
  assert(
    entityLabel === null || typeof entityLabel === 'string',
    'List item has an invalid entity label',
  )
  return {
    __entity_type: 'list_item',
    id: row.id as string,
    list_id: row.list_id as string,
    item_type: itemType,
    entity_id: row.entity_id as string,
    order_index: (row.order_index as number) ?? 0,
    created_at: row.created_at as Date,
    media_type: (row.media_type as string | null) ?? null,
    entity_label: entityLabel ?? excerpt(row.label_markdown) ?? excerpt(row.label_summary),
  }
}

function excerpt(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  return generateExcerpt(value, 80) || null
}
