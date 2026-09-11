import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  setMyCommunityVacation,
  clearMyCommunityVacation,
  getMyCommunityVacation,
  getMyCommunityVacationSettings,
  setSuppressCommunityDigestsWhileOnVacation,
} from '../manage.mts'

async function createTestCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

describe('setMyCommunityVacation', () => {
  let mod: PrivateUser

  beforeAll(async () => {
    mod = await createTestUser()
  })

  it('creates a vacation row and returns it', async () => {
    const community = await createTestCommunity(mod.id)
    const vacation = await setMyCommunityVacation(mod.id, { communityId: community.id })

    expect(vacation.community_id).toBe(community.id)
    expect(vacation.user_id).toBe(mod.id)
    expect(vacation.ends_at).toBeNull()
    expect(vacation.starts_at).toBeInstanceOf(Date)
  })

  it('sets ends_at when provided', async () => {
    const community = await createTestCommunity(mod.id)
    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const vacation = await setMyCommunityVacation(mod.id, { communityId: community.id, endsAt })

    expect(vacation.ends_at).not.toBeNull()
    expect(new Date(vacation.ends_at!).getTime()).toBeGreaterThan(Date.now())
  })

  it('upserts: calling twice updates the row', async () => {
    const community = await createTestCommunity(mod.id)
    const firstEndsAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
    await setMyCommunityVacation(mod.id, { communityId: community.id, endsAt: firstEndsAt })

    const secondEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const vacation = await setMyCommunityVacation(mod.id, {
      communityId: community.id,
      endsAt: secondEndsAt,
    })

    expect(new Date(vacation.ends_at!).getTime()).toBeGreaterThan(new Date(firstEndsAt).getTime())
  })
})

describe('getMyCommunityVacation', () => {
  let mod: PrivateUser

  beforeAll(async () => {
    mod = await createTestUser()
  })

  it('returns null when no vacation row exists', async () => {
    const community = await createTestCommunity(mod.id)
    const result = await getMyCommunityVacation(mod.id, { communityId: community.id })
    expect(result).toBeNull()
  })

  it('returns the active vacation row', async () => {
    const community = await createTestCommunity(mod.id)
    await setMyCommunityVacation(mod.id, { communityId: community.id })

    const result = await getMyCommunityVacation(mod.id, { communityId: community.id })
    expect(result).not.toBeNull()
    expect(result!.user_id).toBe(mod.id)
  })

  it('returns null when vacation has expired (ends_at in the past)', async () => {
    const community = await createTestCommunity(mod.id)
    const expiredEndsAt = new Date(Date.now() - 1000).toISOString()
    await setMyCommunityVacation(mod.id, { communityId: community.id, endsAt: expiredEndsAt })

    const result = await getMyCommunityVacation(mod.id, { communityId: community.id })
    expect(result).toBeNull()
  })
})

describe('clearMyCommunityVacation', () => {
  let mod: PrivateUser

  beforeAll(async () => {
    mod = await createTestUser()
  })

  it('removes an active vacation', async () => {
    const community = await createTestCommunity(mod.id)
    await setMyCommunityVacation(mod.id, { communityId: community.id })
    await clearMyCommunityVacation(mod.id, { communityId: community.id })

    const result = await getMyCommunityVacation(mod.id, { communityId: community.id })
    expect(result).toBeNull()
  })

  it('is a no-op when no vacation exists', async () => {
    const community = await createTestCommunity(mod.id)
    await clearMyCommunityVacation(mod.id, { communityId: community.id })
    const result = await getMyCommunityVacation(mod.id, { communityId: community.id })
    expect(result).toBeNull()
  })
})

describe('community digest vacation suppression preference', () => {
  it('defaults to false independently of vacation state', async () => {
    const mod = await createTestUser()
    const community = await createTestCommunity(mod.id)
    const settings = await getMyCommunityVacationSettings(mod.id, {
      communityId: community.id,
    })
    expect(settings).toEqual({
      vacation: null,
      suppress_community_digests_while_on_vacation: false,
    })
  })

  it('updates without creating or changing a vacation', async () => {
    const mod = await createTestUser()
    const community = await createTestCommunity(mod.id)
    await setSuppressCommunityDigestsWhileOnVacation(mod.id, {
      communityId: community.id,
      suppress: true,
    })
    const settings = await getMyCommunityVacationSettings(mod.id, {
      communityId: community.id,
    })
    expect(settings.vacation).toBeNull()
    expect(settings.suppress_community_digests_while_on_vacation).toBe(true)
  })

  it('survives clearing a vacation', async () => {
    const mod = await createTestUser()
    const community = await createTestCommunity(mod.id)
    await setSuppressCommunityDigestsWhileOnVacation(mod.id, {
      communityId: community.id,
      suppress: true,
    })
    await setMyCommunityVacation(mod.id, { communityId: community.id })
    await clearMyCommunityVacation(mod.id, { communityId: community.id })
    const settings = await getMyCommunityVacationSettings(mod.id, {
      communityId: community.id,
    })
    expect(settings.vacation).toBeNull()
    expect(settings.suppress_community_digests_while_on_vacation).toBe(true)
  })
})
