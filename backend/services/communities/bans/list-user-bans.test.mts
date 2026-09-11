import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestCommunity, insertTestCommunityBan } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor } from '@modules/pagination'
import { listUserActiveCommunityBans } from './search.mts'

describe('listUserActiveCommunityBans', () => {
  let owner: PrivateUser
  let bannedUser: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    bannedUser = await createTestUser()
  })

  it('returns empty results for a user with no bans', async () => {
    const user = await createTestUser()
    const { results, page_info } = await listUserActiveCommunityBans(user.id)
    expect(results.length).toBe(0)
    expect(page_info.has_next_page).toBe(false)
    expect(page_info.end_cursor).toBeNull()
    expect(page_info.start_cursor).toBeNull()
  })

  it('returns active bans for a banned user', async () => {
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      reason: 'Test violation',
    })

    const { results } = await listUserActiveCommunityBans(user.id)
    expect(results.some(b => b.community_id === community.id)).toBe(true)
    const ban = results.find(b => b.community_id === community.id)
    expect(ban?.community_slug).toBe(community.slug)
    expect(ban?.reason).toBe('Test violation')
  })

  it('does not return lifted bans', async () => {
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      liftedAt: new Date(),
      liftedById: owner.id,
    })

    const { results } = await listUserActiveCommunityBans(user.id)
    const found = results.find(b => b.community_id === community.id)
    expect(found).toBeUndefined()
  })

  it('does not return expired bans', async () => {
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      expiresAt: new Date(Date.now() - 1000),
    })

    const { results } = await listUserActiveCommunityBans(user.id)
    const found = results.find(b => b.community_id === community.id)
    expect(found).toBeUndefined()
  })

  it('paginates with after', async () => {
    const user = await createTestUser()
    const communities = await Promise.all([
      insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
      insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
      insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
    ])
    await Promise.all(
      communities.map(c =>
        insertTestCommunityBan({
          communityId: c.id,
          userId: user.id,
          bannedById: owner.id,
        }),
      ),
    )

    const firstPage = await listUserActiveCommunityBans(user.id, { limit: 2 })
    expect(firstPage.results.length).toBe(2)
    expect(firstPage.page_info.has_next_page).toBe(true)
    expect(firstPage.page_info.end_cursor).not.toBeNull()
    expect(firstPage.page_info.start_cursor).not.toBeNull()

    const otherUser = await createTestUser()
    await expect(
      listUserActiveCommunityBans(otherUser.id, {
        limit: 2,
        after: firstPage.page_info.end_cursor!,
      }),
    ).rejects.toMatchObject({ status: 400 })

    const secondPage = await listUserActiveCommunityBans(user.id, {
      limit: 2,
      after: firstPage.page_info.end_cursor!,
    })
    expect(secondPage.results.length).toBeGreaterThanOrEqual(1)
    // No overlap between pages
    const firstIds = new Set(firstPage.results.map(b => b.id))
    for (const ban of secondPage.results) {
      expect(firstIds.has(ban.id)).toBe(false)
    }
  })

  it('throws 422 for non-integer limit', async () => {
    await expect(listUserActiveCommunityBans(bannedUser.id, { limit: 1.5 })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 422 for limit out of range (0)', async () => {
    await expect(listUserActiveCommunityBans(bannedUser.id, { limit: 0 })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 422 for limit out of range (101)', async () => {
    await expect(listUserActiveCommunityBans(bannedUser.id, { limit: 101 })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 400 for invalid cursor format', async () => {
    const badCursor = encodeCursor({ id: 'not-a-uuid' })
    await expect(
      listUserActiveCommunityBans(bannedUser.id, { after: badCursor }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects an otherwise-valid unscoped cursor', async () => {
    const unscopedCursor = encodeCursor({ id: crypto.randomUUID() })
    await expect(
      listUserActiveCommunityBans(bannedUser.id, { after: unscopedCursor }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 for a completely malformed cursor string', async () => {
    await expect(
      listUserActiveCommunityBans(bannedUser.id, { after: 'not-base64-at-all!!!' }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
