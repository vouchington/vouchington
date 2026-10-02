import type { List, ListItem } from '@services/lists'
import { externalText, iso, sanitizedTitle, type McpPageLimit } from './mcp-read-output.mts'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

/** The list read tools page like the signed-out REST routes: 25 at most, 20 by default. */
export const LIST_PAGE_LIMIT: McpPageLimit = { min: 1, max: 25, default: 20 }

/**
 * The one answer for a list the caller may not read. An unknown id, a removed list, somebody
 * else's private list and an owner's private list read without the private grant all look alike.
 */
export const LIST_NOT_FOUND = { success: false, error: 'List not found' } as const

const LIST_FIELDS = [
  'id',
  'owner_user_id',
  'name',
  'description',
  'visibility',
  'created_at',
  'updated_at',
] as const

const LIST_ITEM_FIELDS = [
  'id',
  'list_id',
  'item_type',
  'entity_id',
  'order_index',
  'media_type',
  'created_at',
] as const

/** One list as an MCP client receives it. A removed list never reaches this shape. */
export type McpList = {
  id: string
  owner_user_id: string
  name: string
  description: string | null
  visibility: List['visibility']
  created_at: string
  updated_at: string
}

/** One entry of a list: which kind of item it is and the id to read it with. */
export type McpListItem = {
  id: string
  list_id: string
  item_type: ListItem['item_type']
  entity_id: string
  order_index: number
  media_type: string | null
  created_at: string
}

/** A list's name is sanitized like a title; its description is wrapped as external content. */
export async function toMcpList(list: List): Promise<McpList> {
  const [name, description] = await Promise.all([
    sanitizedTitle(list.name),
    externalText(list.description, 'list', 'list_description'),
  ])
  return {
    id: list.id,
    owner_user_id: list.owner_user_id,
    name,
    description,
    visibility: list.visibility,
    created_at: iso(list.created_at),
    updated_at: iso(list.updated_at),
  }
}

export function toMcpListItem(item: ListItem): McpListItem {
  return {
    id: item.id,
    list_id: item.list_id,
    item_type: item.item_type,
    entity_id: item.entity_id,
    order_index: item.order_index,
    media_type: item.media_type,
    created_at: iso(item.created_at),
  }
}

/** The schema of an `McpList`, from the generated `List` contract. */
export const mcpListSchema = () => closedObject(pickProperties('List', LIST_FIELDS))

/** The schema of an `McpListItem`, from the generated `ListItem` contract. */
export const mcpListItemSchema = () => closedObject(pickProperties('ListItem', LIST_ITEM_FIELDS))
