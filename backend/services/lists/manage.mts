import assert from 'http-assert'
import { currentUserCanManageList } from './authorization.mts'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { createList, getListForWrite, updateList } from './lists.mts'
import type { List, ListVisibility } from './types.mts'

const MAX_LIST_NAME_LENGTH = 255

declare const manageable: unique symbol

/** A list the caller owns and has not removed. Only `getManageableList` can produce one. */
export type ManageableList = List & { readonly [manageable]: true }

export type CreateOwnedListInput = {
  name: string
  description?: string | null
  visibility?: ListVisibility
}

export type UpdateOwnedListInput = {
  name?: string
  description?: string | null
  visibility?: ListVisibility
}

/**
 * The list a write targets, once its owner is the caller. A missing or removed list is 404 and
 * another user's list is 403, the same answers whichever surface asked.
 */
export async function getManageableList(
  currentUserId: string,
  listId: string,
): Promise<ManageableList> {
  const list = await getListForWrite(listId)
  assert(list, 404, 'List not found')
  assert(currentUserCanManageList(currentUserId, list), 403, 'Forbidden')
  return list as ManageableList
}

export function assertValidListName(name: string): void {
  assert(name.length > 0, 422, 'name must be a non-empty string')
  assert(name.length <= MAX_LIST_NAME_LENGTH, 422, 'name must be 255 characters or less')
}

/** Creates a list for its owner, defaulting to a private list with no description. */
export async function createOwnedList(currentUserId: string, provenance: ContentProvenance, input: CreateOwnedListInput) {
  assertValidListName(input.name)
  return createList(currentUserId, provenance, {
    name: input.name,
    description: input.description ?? null,
    visibility: input.visibility ?? 'private',
  })
}

/** Updates only the fields the caller sent; an omitted description is left as it is. */
export async function updateOwnedList(
  currentUserId: string,
  list: ManageableList,
  input: UpdateOwnedListInput,
) {
  if (input.name !== undefined) assertValidListName(input.name)
  return updateList(currentUserId, list.id, input)
}
