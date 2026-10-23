import {
  addListItem,
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

/** Adds each visible item. One lookup per entity type, then the existing single-item insert. */
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
  const results: AddedListItem[] = []
  // oxlint-disable no-await-in-loop -- each insert returns that item's row
  for (const [index, item] of items.entries()) {
    const id = item.item_type === 'post' ? postIds[index] : feedIds[index]
    if (item.item_type === 'post' && id && forbiddenIds.has(id)) {
      results.push({ ...item, status: 'forbidden', error: 'Forbidden' })
      continue
    }
    if (item.item_type === 'post' && id && ineligibleIds.has(id)) {
      results.push({ ...item, status: 'ineligible', error: "Post can't be added to a list" })
      continue
    }
    const allowed =
      id !== null && (item.item_type === 'post' ? allowedIds.has(id) : allowedFeeds.has(id))
    if (!id || !allowed) {
      results.push({ ...item, status: 'not_found', error: 'Not found' })
      continue
    }
    try {
      // no-mistakes-disable-next-line query-reached-per-item: visibility is one batch; each insert is the existing single-item write
      const list_item = await addListItem(listId, item.item_type, id)
      results.push({ ...item, status: 'added', list_item })
    } catch (err) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined
      if (status !== 404 && status !== 403) throw err
      results.push({
        ...item,
        status: status === 404 ? 'not_found' : 'forbidden',
        error: err instanceof Error ? err.message : status === 404 ? 'Not found' : 'Forbidden',
      })
    }
  }
  // oxlint-enable no-await-in-loop
  return results
}
