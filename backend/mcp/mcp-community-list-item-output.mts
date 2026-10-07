import type { CommunityListItem, CommunityListItemType } from '@services/communities'
import { getRssFeedByIdCachedBatch } from '@services/entity-fetch'
import { getUrlsByIdBatch } from '@services/urls'
import { getUrlHostnamesByAnyBatch } from '@services/urls-hostnames'
import { iso, sanitizedTitle } from './mcp-read-output.mts'
import { nullable } from './output-schema-shapes.mts'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

/** The kinds of thing a community list holds, in the order the counts report them. */
export const COMMUNITY_LIST_ITEM_TYPES = [
  'topic',
  'rss_feed',
  'post',
  'url_hostname',
  'url',
] as const satisfies readonly CommunityListItemType[]

const ITEM_FIELDS = ['id', 'item_type', 'entity_id', 'order_index', 'created_at'] as const

/**
 * One entry of a community list. `entity_id` is what the entry points at. `label` names it where
 * nothing else can: the hostname, the page URL or the feed title. Topics and posts have no label
 * because `get_topic_details` and `get_post` read them by id. Who added the entry stays out.
 */
export type McpCommunityListItem = {
  id: string
  item_type: CommunityListItemType
  entity_id: string
  order_index: number
  created_at: string
  label: string | null
}

type Labelled = { id: string } & Record<string, unknown>

/** The label of each id, in order; an entity that cannot be read any more has none. */
async function labelsFor(
  itemType: CommunityListItemType,
  entityIds: string[],
): Promise<Array<string | null>> {
  const label = async (rows: Array<Labelled | null | undefined>, field: string) => {
    const byId = new Map(rows.flatMap(row => (row ? [[row.id, row[field] as string]] : [])))
    return Promise.all(
      entityIds.map(id => (byId.has(id) ? sanitizedTitle(byId.get(id)!) : Promise.resolve(null))),
    )
  }
  switch (itemType) {
    case 'url_hostname':
      return label(await getUrlHostnamesByAnyBatch(entityIds), 'hostname')
    case 'url':
      return label(await getUrlsByIdBatch(entityIds), 'url')
    case 'rss_feed':
      return label(await getRssFeedByIdCachedBatch(entityIds), 'title')
    default:
      return entityIds.map(() => null)
  }
}

/** A page of community list entries, each with its label. Every entry is of `itemType`. */
export async function toMcpCommunityListItems(
  itemType: CommunityListItemType,
  items: CommunityListItem[],
): Promise<McpCommunityListItem[]> {
  const labels = await labelsFor(
    itemType,
    items.map(item => item.entity_id),
  )
  return items.map((item, index) => ({
    id: item.id,
    item_type: item.item_type,
    entity_id: item.entity_id,
    order_index: item.order_index,
    created_at: iso(item.created_at),
    label: labels[index]!,
  }))
}

/** The schema of an `McpCommunityListItem`, from the generated `CommunityListItem` contract. */
export const mcpCommunityListItemSchema = () =>
  closedObject({
    ...pickProperties('CommunityListItem', ITEM_FIELDS),
    label: nullable({ type: 'string' }),
  })
