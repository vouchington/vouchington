import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { isAdminUser, assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import { getStoryItemIds } from './get.mts'
import { adminAssignItemToStory, adminRemoveItemFromStory } from './assign.mts'
import { adminSetStoryOfficialItem, updateStoryTitle } from './update.mts'

function assertStaffWrite(user: PrivateUser, storyId: string): void {
  assert(isAdminUser(user), 403, 'Administrator role required')
  assertNotSuspended(user)
  assert(isUUID(storyId), 400, 'Invalid story ID')
}

async function assertStoryItem(
  storyId: string,
  itemId: string,
  membership: boolean,
): Promise<void> {
  assert(isUUID(itemId), 400, 'Invalid item ID')
  assert(await getStoryById(storyId), 404, 'Story not found')
  if (membership)
    assert((await getStoryItemIds(storyId)).includes(itemId), 400, 'Item is not in this story')
}

export async function addEditorialStoryItem(
  user: PrivateUser,
  storyId: string,
  itemId: string,
): Promise<void> {
  assertStaffWrite(user, storyId)
  await assertStoryItem(storyId, itemId, false)
  assert(await adminAssignItemToStory(user.id, storyId, itemId), 404, 'Item not found')
}

export async function removeEditorialStoryItem(
  user: PrivateUser,
  storyId: string,
  itemId: string,
): Promise<void> {
  assertStaffWrite(user, storyId)
  await assertStoryItem(storyId, itemId, true)
  assert(
    await adminRemoveItemFromStory(user.id, itemId, { expectedStoryId: storyId }),
    404,
    'Item not found',
  )
}

export async function setEditorialStoryOfficialItem(
  user: PrivateUser,
  storyId: string,
  itemId: string,
) {
  assertStaffWrite(user, storyId)
  await assertStoryItem(storyId, itemId, true)
  const story = await adminSetStoryOfficialItem(user.id, storyId, itemId)
  assert(story, 404, 'Story not found')
  return { story }
}

export async function renameEditorialStory(user: PrivateUser, storyId: string, input: string) {
  assertStaffWrite(user, storyId)
  const title = typeof input === 'string' ? input.trim() : ''
  assert(title.length > 0, 400, 'title is required')
  assert(title.length <= 500, 400, 'title must be at most 500 characters')
  const story = await updateStoryTitle(user.id, storyId, title)
  assert(story, 404, 'Story not found')
  return { story }
}
