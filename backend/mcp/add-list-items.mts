import {
  addListItems,
  filterListablePostIds,
  filterListableRssFeedItemIds,
  type ListItem,
  type ListItemType,
} from '@services/lists'
import type { EntityRelationActionAuthority } from '@services/entity-relation-actions'
import { entityRelationViewerFor } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import { canonicalEntityIds } from './resolve-entity-reference.mts'
import { sanitizedTitle } from './mcp-read-output.mts'

export const ADD_LIST_ITEM_LIMIT = 100

// The structured MCP result cap is 512 KiB. Echoed items stay under half of that.
const MAX_ECHOED_ITEM_BYTES = 256 * 1024

export type ListItemRef = { item_type: ListItemType; entity: string }

export type AddedListItem = {
  item_type: ListItemType
  entity: string
  status: 'added' | 'not_found' | 'forbidden' | 'ineligible'
  list_item?: ListItem
  error?: string
}

async function idsFor(
  itemType: ListItemType,
  items: readonly ListItemRef[],
): Promise<Array<string | null>> {
  const indexes = items.flatMap((item, index) => (item.item_type === itemType ? [index] : []))
  const resolved = await canonicalEntityIds(
    itemType,
    indexes.map(index => items[index]!.entity),
  )
  const ids: Array<string | null> = items.map(() => null)
  indexes.forEach((index, position) => {
    ids[index] = resolved[position] ?? null
  })
  return ids
}

/** Adds each visible item. One lookup and one insert per entity type. */
export async function addVisibleListItems(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority | null,
  listId: string,
  items: readonly ListItemRef[],
): Promise<AddedListItem[]> {
  assert(items.length <= ADD_LIST_ITEM_LIMIT, 400, 'At most 100 items')
  assert(
    Buffer.byteLength(JSON.stringify(items), 'utf8') <= MAX_ECHOED_ITEM_BYTES,
    400,
    'Items are too large to return',
  )
  const [postIds, feedIds] = await Promise.all([
    idsFor('post', items),
    idsFor('rss_feed_item', items),
  ])
  const postCandidates = postIds.filter((id): id is string => id !== null)
  const feedCandidates = feedIds.filter((id): id is string => id !== null)
  const [{ allowedIds, forbiddenIds, ineligibleIds }, allowedFeeds] = await Promise.all([
    filterListablePostIds(entityRelationViewerFor(currentUser), authority, postCandidates),
    filterListableRssFeedItemIds(feedCandidates),
  ])
  const outcomes: Array<AddedListItem | null> = items.map((item, index) => {
    const id = item.item_type === 'post' ? postIds[index] : feedIds[index]
    if (item.item_type === 'post' && id && forbiddenIds.has(id)) {
      return { ...item, status: 'forbidden', error: 'Forbidden' }
    }
    if (item.item_type === 'post' && id && ineligibleIds.has(id)) {
      return { ...item, status: 'ineligible', error: "Post can't be added to a list" }
    }
    const allowed =
      id !== null && (item.item_type === 'post' ? allowedIds.has(id) : allowedFeeds.has(id))
    return !id || !allowed ? { ...item, status: 'not_found', error: 'Not found' } : null
  })
  const [addedPosts, addedFeeds] = await Promise.all([
    addAllowed(listId, 'post', postIds, outcomes),
    addAllowed(listId, 'rss_feed_item', feedIds, outcomes),
  ])
  return Promise.all(
    items.map(async (item, index) => {
      const outcome = outcomes[index]
      if (outcome) return outcome
      const id = (item.item_type === 'post' ? postIds[index] : feedIds[index])!
      const added = item.item_type === 'post' ? addedPosts : addedFeeds
      if ('error' in added) return { ...item, status: added.status, error: added.error }
      const list_item = added.get(id.toLowerCase())
      if (!list_item) return { ...item, status: 'not_found' as const, error: 'Not found' }
      return {
        ...item,
        status: 'added' as const,
        list_item: {
          ...list_item,
          entity_label:
            list_item.entity_label === null ? null : await sanitizedTitle(list_item.entity_label),
        },
      }
    }),
  )
}

/** One batch insert per item type for the entries no earlier check settled. */
async function addAllowed(
  listId: string,
  itemType: ListItemType,
  ids: ReadonlyArray<string | null>,
  outcomes: ReadonlyArray<AddedListItem | null>,
) {
  const pending = ids.flatMap((id, index) => (id && !outcomes[index] ? [id] : []))
  try {
    return await addListItems(listId, itemType, pending)
  } catch (err) {
    const status =
      typeof err === 'object' && err !== null && 'status' in err
        ? (err as { status?: unknown }).status
        : undefined
    if (status !== 404 && status !== 403) throw err
    return {
      error: err instanceof Error ? err.message : status === 404 ? 'Not found' : 'Forbidden',
      status: status === 404 ? ('not_found' as const) : ('forbidden' as const),
    }
  }
}
