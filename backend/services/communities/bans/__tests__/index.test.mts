import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
  softDeleteUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../../types.mts'
import { banUserFromCommunity } from '../create.mts'
import { liftCommunityBan } from '../lift.mts'
import { getActiveCommunityBan } from '../get.mts'
import { searchCommunityBans } from '../search.mts'

describe('banUserFromCommunity', () => {
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

  it('owner can ban a member', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const ban = await banUserFromCommunity(owner, community.id, member.id)

    expect(ban.community_id).toBe(community.id)
    expect(ban.user_id).toBe(member.id)
    expect(ban.banned_by_id).toBe(owner.id)
    expect(ban.lifted_at).toBeNull()
    expect(ban.expires_at).toBeNull()

    // Member should be kicked
    const { getCommunityMember } = await import('../../members/get.mts')
    const membership = await getCommunityMember(community.id, member.id)
    expect(membership).toBeNull()
  })

  it('owner can ban a member with reason and expiry', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const ban = await banUserFromCommunity(owner, community.id, member.id, {
      reason: 'Spamming',
      expiresAt,
    })

    expect(ban.reason).toBe('Spamming')
    expect(ban.expires_at).toBeInstanceOf(Date)
  })

  it('moderator can ban a regular member', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const ban = await banUserFromCommunity(moderator, community.id, member.id)
    expect(ban.banned_by_id).toBe(moderator.id)
  })

  it('moderator cannot ban another moderator', async () => {
    const anotherMod = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: anotherMod.id,
      role: 'moderator',
    })

    await expect(
      banUserFromCommunity(moderator, community.id, anotherMod.id),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('owner cannot be banned', async () => {
    await expect(banUserFromCommunity(moderator, community.id, owner.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('site admin cannot ban the community owner', async () => {
    const admin = await createTestUser({ administrator: true })
    await expect(banUserFromCommunity(admin, community.id, owner.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('moderator cannot ban a non-member', async () => {
    const outsider = await createTestUser()
    await expect(banUserFromCommunity(moderator, community.id, outsider.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('site admin can ban a non-member (preemptive)', async () => {
    const admin = await createTestUser({ administrator: true })
    const outsider = await createTestUser()
    const ban = await banUserFromCommunity(admin, community.id, outsider.id)
    expect(ban.user_id).toBe(outsider.id)
  })

  it('cannot ban yourself', async () => {
    await expect(banUserFromCommunity(owner, community.id, owner.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('returns 404 for a non-existent target user', async () => {
    await expect(banUserFromCommunity(owner, community.id, randomUUID())).rejects.toMatchObject({
      status: 404,
    })
  })

  it('inserts a new ban row when banning an already-active user', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    await banUserFromCommunity(owner, community.id, member.id, { reason: 'first' })

    const ban2 = await banUserFromCommunity(owner, community.id, member.id, { reason: 'second' })
    expect(ban2.reason).toBe('second')

    const { results } = await searchCommunityBans(community.id)
    const bansForUser = results.filter(b => b.user_id === member.id && b.lifted_at === null)
    expect(bansForUser).toHaveLength(2)
  })

  it('re-ban after lift inserts fresh row', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    await banUserFromCommunity(owner, community.id, member.id)
    await liftCommunityBan(owner, community.id, member.id)

    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const ban2 = await banUserFromCommunity(owner, community.id, member.id)
    expect(ban2.lifted_at).toBeNull()
  })

  it('re-ban after natural expiry preserves the expired row without marking it lifted', async () => {
    const user = await createTestUser()
    const expired = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      reason: 'temporary',
      expiresAt: new Date(Date.now() - 1000),
    })

    const fresh = await banUserFromCommunity(owner, community.id, user.id, { reason: 'again' })
    expect(fresh.id).not.toBe(expired.id)
    expect(fresh.lifted_at).toBeNull()

    // The expired row is untouched: still unlifted, still its original expiry/reason.
    const { results } = await searchCommunityBans(community.id)
    const expiredRow = results.find(b => b.id === expired.id)
    expect(expiredRow?.lifted_at).toBeNull()
    expect(expiredRow?.reason).toBe('temporary')

    // Exactly one currently-active ban (the fresh one).
    const active = await getActiveCommunityBan(community.id, user.id)
    expect(active?.id).toBe(fresh.id)
  })

  it('non-member cannot ban (no community membership)', async () => {
    const nonMember = await createTestUser()
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await expect(banUserFromCommunity(nonMember, community.id, member.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('owner can ban a moderator', async () => {
    const mod = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: mod.id,
      role: 'moderator',
    })

    const ban = await banUserFromCommunity(owner, community.id, mod.id)
    expect(ban.user_id).toBe(mod.id)
    expect(ban.lifted_at).toBeNull()
  })
})

describe('liftCommunityBan issuer privileges', () => {
  it('allows a moderator to lift a ban from a deleted former administrator', async () => {
    const [owner, moderator, formerAdmin, target] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ extraRoles: ['administrator'] }),
      createTestUser(),
    ])
    const community = await insertTestCommunity({
      createdById: owner!.id,
      visibility: 'public',
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator!.id,
        role: 'moderator',
      }),
      insertTestCommunityBan({
        communityId: community.id,
        userId: target!.id,
        bannedById: formerAdmin!.id,
      }),
    ])
    await softDeleteUser(formerAdmin!.id)

    await liftCommunityBan(moderator!, community.id, target!.id)

    await expect(getActiveCommunityBan(community.id, target!.id)).resolves.toBeNull()
  })
})
