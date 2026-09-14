import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createSavedReply } from '@services/modmail/saved-replies'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

type SavedReplyPage = {
  results: Array<{ id: string; community_id: string; order_index: number }>
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

describe('saved-reply cursor behavior', () => {
  it('returns canonical empty, partial, exact-limit, and multi-page metadata', async () => {
    const owner = await createTestUser()
    const emptyCommunity = await communityWithOwner(owner)
    expect(await getReplies(owner, emptyCommunity, 'limit=2')).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    const partialCommunity = await communityWithOwner(owner)
    const partialReply = await createSavedReply(owner.id, partialCommunity.id, {
      title: 'partial',
      body: 'partial',
    })
    const partial = await getReplies(owner, partialCommunity, 'limit=2')
    expect(partial.results.map(result => result.id)).toEqual([partialReply.id])
    expect(partial.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(partial.page_info.start_cursor).toBeTruthy()

    const exactCommunity = await communityWithOwner(owner)
    await createReplies(owner, exactCommunity, 2)
    const exact = await getReplies(owner, exactCommunity, 'limit=2')
    expect(exact.results).toHaveLength(2)
    expect(exact.page_info).toMatchObject({ has_next_page: false, end_cursor: null })

    const pagedCommunity = await communityWithOwner(owner)
    const replies = await createReplies(owner, pagedCommunity, 3)
    const first = await getReplies(owner, pagedCommunity, 'limit=2')
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getReplies(
      owner,
      pagedCommunity,
      `limit=2&after=${encodeURIComponent(first.page_info.end_cursor!)}`,
    )
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    const combined = [...first.results, ...second.results]
    expect(combined.map(result => result.order_index)).toEqual([0, 1, 2])
    expect(new Set(combined.map(result => result.id))).toEqual(
      new Set(replies.map(reply => reply.id)),
    )
  })

  it('rejects malformed cursors', async () => {
    const owner = await createTestUser()
    const target = await communityWithOwner(owner)
    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .get(`/api/v1/communities/${target.slug}/saved-replies?after=not-a-cursor`)
      .expect(400)
  })

  it('keeps community scope when a valid ranking cursor is replayed', async () => {
    const owner = await createTestUser()
    const [sourceCommunity, targetCommunity] = await Promise.all([
      communityWithOwner(owner),
      communityWithOwner(owner),
    ])
    const sourceReplies = await createReplies(owner, sourceCommunity, 2)
    const targetReplies = await createReplies(owner, targetCommunity, 3)
    const sourcePage = await getReplies(owner, sourceCommunity, 'limit=1')
    const replay = await getReplies(
      owner,
      targetCommunity,
      `limit=10&after=${encodeURIComponent(sourcePage.page_info.end_cursor!)}`,
    )

    const replayIds = replay.results.map(reply => reply.id)
    expect(replayIds.length).toBeGreaterThan(0)
    expect(replay.results.every(reply => reply.community_id === targetCommunity.id)).toBe(true)
    expect(replayIds.every(id => targetReplies.some(reply => reply.id === id))).toBe(true)
    expect(replayIds.some(id => sourceReplies.some(reply => reply.id === id))).toBe(false)
  })
})

async function communityWithOwner(owner: PrivateUser): Promise<Community> {
  const target = await insertTestCommunity({ createdById: owner.id })
  await insertTestCommunityMember({ communityId: target.id, userId: owner.id, role: 'owner' })
  return target
}

async function createReplies(owner: PrivateUser, target: Community, count: number) {
  const replies = []
  for (let index = 0; index < count; index += 1) {
    replies.push(
      await createSavedReply(owner.id, target.id, {
        title: `reply ${index}`,
        body: `body ${index}`,
      }),
    )
  }
  return replies
}

async function getReplies(
  owner: PrivateUser,
  target: Community,
  query: string,
): Promise<SavedReplyPage> {
  const request = createRequest()
  await request.authenticateAs(owner)
  const response = await request
    .get(`/api/v1/communities/${target.slug}/saved-replies?${query}`)
    .expect(200)
  return response.body as SavedReplyPage
}
