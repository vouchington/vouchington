import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../../types.mts'
import { liftCommunityBan } from '../lift.mts'
import { getActiveCommunityBan, assertNotBanned, getCommunityBanById } from '../get.mts'
import { searchCommunityBans } from '../search.mts'
import { encodeCursor } from '@modules/pagination'

describe('getActiveCommunityBan + assertNotBanned', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('returns null for unbanned user', async () => {
    const user = await createTestUser()
    const result = await getActiveCommunityBan(community.id, user.id)
    expect(result).toBeNull()
  })

  it('returns ban for banned user', async () => {
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })

    const result = await getActiveCommunityBan(community.id, user.id)
    expect(result).not.toBeNull()
    expect(result?.user_id).toBe(user.id)
  })

  it('returns null for expired ban', async () => {
    const user = await createTestUser()
    const pastDate = new Date(Date.now() - 1000)
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      expiresAt: pastDate,
    })

    const result = await getActiveCommunityBan(community.id, user.id)
    expect(result).toBeNull()
  })

  it('returns null for lifted ban', async () => {
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      liftedAt: new Date(),
      liftedById: owner.id,
    })

    const result = await getActiveCommunityBan(community.id, user.id)
    expect(result).toBeNull()
  })

  it('assertNotBanned throws COMMUNITY_BANNED for active ban', async () => {
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })

    await expect(assertNotBanned(community.id, user.id)).rejects.toMatchObject({
      status: 403,
      code: 'COMMUNITY_BANNED',
    })
  })

  it('assertNotBanned resolves for unbanned user', async () => {
    const user = await createTestUser()
    await expect(assertNotBanned(community.id, user.id)).resolves.toBeUndefined()
  })
})

describe('liftCommunityBan', () => {
  let owner: PrivateUser
  let moderator: PrivateUser
  let community: Community

  beforeAll(async () => {
    const [o, m] = await Promise.all([createTestUser(), createTestUser()])
    owner = o!
    moderator = m!
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])
  })

  it('owner can lift a ban', async () => {
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })

    await liftCommunityBan(owner, community.id, user.id)
    const ban = await getActiveCommunityBan(community.id, user.id)
    expect(ban).toBeNull()
  })

  it('lifting an active ban does not rewrite a prior expired ban as lifted', async () => {
    const user = await createTestUser()
    const expired = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      reason: 'old temporary',
      expiresAt: new Date(Date.now() - 1000),
    })
    const active = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      reason: 'current',
    })

    await liftCommunityBan(owner, community.id, user.id)

    const { results } = await searchCommunityBans(community.id)
    const expiredRow = results.find(b => b.id === expired.id)
    const activeRow = results.find(b => b.id === active.id)
    expect(expiredRow?.lifted_at).toBeNull()
    expect(activeRow?.lifted_at).not.toBeNull()
  })

  it('moderator can lift a ban issued by a moderator', async () => {
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: moderator.id,
    })

    await liftCommunityBan(moderator, community.id, user.id)
    const ban = await getActiveCommunityBan(community.id, user.id)
    expect(ban).toBeNull()
  })

  it('moderator cannot lift a ban issued by the owner', async () => {
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })

    await expect(liftCommunityBan(moderator, community.id, user.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('throws 404 if no active ban exists', async () => {
    const user = await createTestUser()
    await expect(liftCommunityBan(owner, community.id, user.id)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('second lift throws 404', async () => {
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })

    await liftCommunityBan(owner, community.id, user.id)
    await expect(liftCommunityBan(owner, community.id, user.id)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('lifts all active ban rows for the user in one call', async () => {
    const user = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })

    await liftCommunityBan(owner, community.id, user.id)

    const ban = await getActiveCommunityBan(community.id, user.id)
    expect(ban).toBeNull()
  })

  it('non-member cannot lift a ban', async () => {
    const user = await createTestUser()
    const nonMember = await createTestUser()
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })

    await expect(liftCommunityBan(nonMember, community.id, user.id)).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('searchCommunityBans', () => {
  it('returns paginated ban list including lifted bans', async () => {
    const owner = await createTestUser()
    const communityForSearch = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'public',
    })
    const [u1, u2] = await Promise.all([createTestUser(), createTestUser()])
    await Promise.all([
      insertTestCommunityBan({
        communityId: communityForSearch.id,
        userId: u1!.id,
        bannedById: owner.id,
      }),
      insertTestCommunityBan({
        communityId: communityForSearch.id,
        userId: u2!.id,
        bannedById: owner.id,
        liftedAt: new Date(),
        liftedById: owner.id,
      }),
    ])

    const { results, page_info } = await searchCommunityBans(communityForSearch.id)
    expect(results.length).toBe(2)
    expect(results.some(b => b.lifted_at !== null)).toBe(true)
    expect(page_info).toHaveProperty('has_next_page')
  })

  it('rejects a cursor whose id is not a UUID with 400 (not a DB cast error)', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    const badCursor = encodeCursor({ id: 'not-a-uuid' })
    await expect(searchCommunityBans(community.id, { after: badCursor })).rejects.toMatchObject({
      status: 400,
    })
  })
})

describe('getCommunityBanById', () => {
  it('returns ban when found', async () => {
    const owner = await createTestUser()
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      reason: 'Test reason',
    })

    const result = await getCommunityBanById(ban.id)
    expect(result).not.toBeNull()
    expect(result?.id).toBe(ban.id)
    expect(result?.user_id).toBe(user.id)
    expect(result?.community_id).toBe(community.id)
  })

  it('returns null when not found', async () => {
    const result = await getCommunityBanById(crypto.randomUUID())
    expect(result).toBeNull()
  })
})
