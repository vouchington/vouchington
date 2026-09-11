import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createSavedReply, getCommunitySavedReplies, deleteSavedReply } from '../saved-replies.mts'

async function createTestCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

describe('createSavedReply', () => {
  it('creates a saved reply for a community', async () => {
    const mod = await createTestUser()
    const community = await createTestCommunity(mod.id)

    const reply = await createSavedReply(mod.id, community.id, {
      title: 'Welcome',
      body: 'Thank you for reaching out!',
    })

    expect(reply.id).toBeTruthy()
    expect(reply.community_id).toBe(community.id)
    expect(reply.title).toBe('Welcome')
    expect(reply.body).toBe('Thank you for reaching out!')
    expect(reply.created_by_id).toBe(mod.id)
  })
})

describe('getCommunitySavedReplies', () => {
  it('returns non-deleted replies ordered by order_index', async () => {
    const mod = await createTestUser()
    const community = await createTestCommunity(mod.id)

    await createSavedReply(mod.id, community.id, { title: 'B', body: 'Body B' })
    const replyA = await createSavedReply(mod.id, community.id, { title: 'A', body: 'Body A' })

    const replies = await getCommunitySavedReplies(community.id)
    const replyIds = replies.map(r => r.id)
    expect(replyIds).toContain(replyA.id)
    expect(replies[0]!.order_index).toBeLessThanOrEqual(replies[1]!.order_index)
  })
})

describe('deleteSavedReply', () => {
  it('soft-deletes a saved reply', async () => {
    const mod = await createTestUser()
    const community = await createTestCommunity(mod.id)

    const reply = await createSavedReply(mod.id, community.id, {
      title: 'Delete me',
      body: 'Body',
    })
    await deleteSavedReply(mod.id, community.id, reply.id)

    const remaining = await getCommunitySavedReplies(community.id)
    const ids = remaining.map(r => r.id)
    expect(ids).not.toContain(reply.id)
  })
})
