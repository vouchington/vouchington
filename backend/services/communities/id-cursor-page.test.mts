import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityInvite,
  insertTestPost,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { decodeUuidCursor, isNameCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { PrivateUser } from '@services/users/types'
import type { Community } from './types.mts'
import { searchInvites } from './invites/get.mts'
import { searchPendingPosts } from './publications/get.mts'

type IdPage = {
  results: { id: string }[]
  page_info: PageInfo
}

describe('community id cursor pages', () => {
  let owner: PrivateUser
  let community: Community
  let firstInvitee: PrivateUser
  let secondInvitee: PrivateUser

  beforeAll(async () => {
    ;[owner, firstInvitee, secondInvitee] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    community = await insertTestCommunity({ createdById: owner.id })
  })

  it('rejects a non-integer limit and a limit outside 1..100', async () => {
    await expect(searchInvites(community.id, { limit: 1.5 })).rejects.toMatchObject({
      status: 422,
      message: 'limit must be an integer',
    })
    await expect(searchInvites(community.id, { limit: 0 })).rejects.toMatchObject({
      status: 422,
      message: 'limit must be between 1 and 100',
    })
    await expect(searchInvites(community.id, { limit: 101 })).rejects.toMatchObject({
      status: 422,
      message: 'limit must be between 1 and 100',
    })
  })

  it('pages community invites by id descending', async () => {
    const [firstInvite, secondInvite] = await Promise.all([
      insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: firstInvitee.id,
      }),
      insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: secondInvitee.id,
      }),
    ])
    const expected = [firstInvite.id, secondInvite.id].sort((left, right) =>
      left < right ? 1 : -1,
    )

    const ids = await collectIdPages(after => searchInvites(community.id, { limit: 1, after }))

    expect(ids).toEqual(expected)
  })

  it('pages pending posts by post id ascending', async () => {
    const pendingCommunity = await insertTestCommunity({ createdById: owner.id })
    const postIds = await Promise.all([
      insertPendingPost(pendingCommunity.id, owner.id),
      insertPendingPost(pendingCommunity.id, owner.id),
    ])
    const expected = [...postIds].sort((left, right) => (left < right ? -1 : 1))

    const ids = await collectIdPages(after =>
      searchPendingPosts(pendingCommunity.id, { limit: 1, after }),
    )

    expect(ids).toEqual(expected)
  })
})

async function insertPendingPost(communityId: string, createdById: string): Promise<string> {
  const suffix = createRandomString(8)
  const postId = await insertTestPost({
    title: `Pending page post ${suffix}`,
    slug: `pending-page-post-${suffix}`,
    markdown: 'Pending page content',
    createdById,
    communityId,
  })
  await insertTestPendingCommunityPostReview({ communityId, postId, submittedById: createdById })
  return postId
}

function decodedNameCursor(cursor: string): { name: string; id: string } {
  return decodeUuidCursor(cursor, isNameCursor, 'Invalid cursor format')
}

async function collectIdPages(load: (after?: string) => Promise<IdPage>): Promise<string[]> {
  const first = await load()
  expect(first.results).toHaveLength(1)
  expect(first.page_info.has_next_page).toBe(true)
  const firstId = first.results[0]!.id
  expect(decodedNameCursor(first.page_info.start_cursor!)).toEqual({ name: firstId, id: firstId })
  expect(decodedNameCursor(first.page_info.end_cursor!)).toEqual({ name: firstId, id: firstId })

  const second = await load(first.page_info.end_cursor!)
  expect(second.results).toHaveLength(1)
  expect(second.page_info.has_next_page).toBe(false)
  expect(second.page_info.end_cursor).toBeNull()
  const secondId = second.results[0]!.id
  expect(decodedNameCursor(second.page_info.start_cursor!)).toEqual({
    name: secondId,
    id: secondId,
  })

  return [firstId, secondId]
}
