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

const logicalTime = new Date('2001-01-31T23:59:59.000Z')
const clock = () => new Date(logicalTime)

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
    const endsAt = new Date(logicalTime.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const vacation = await setMyCommunityVacation(
      mod.id,
      { communityId: community.id, endsAt },
      { clock },
    )

    expect(vacation.ends_at).not.toBeNull()
    expect(vacation.starts_at).toEqual(logicalTime)
    expect(vacation.ends_at).toEqual(new Date(endsAt))
    expect(new Date(vacation.ends_at!).getTime()).toBeGreaterThan(logicalTime.getTime())
  })

  it('upserts: calling twice updates the row', async () => {
    const community = await createTestCommunity(mod.id)
    const firstEndsAt = new Date(logicalTime.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString()
    await setMyCommunityVacation(
      mod.id,
      { communityId: community.id, endsAt: firstEndsAt },
      { clock },
    )

    const secondEndsAt = new Date(logicalTime.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const vacation = await setMyCommunityVacation(
      mod.id,
      { communityId: community.id, endsAt: secondEndsAt },
      { clock },
    )
    expect(vacation.ends_at).toEqual(new Date(secondEndsAt))

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
    await setMyCommunityVacation(mod.id, { communityId: community.id }, { clock })

    const result = await getMyCommunityVacation(mod.id, { communityId: community.id }, { clock })
    expect(result).not.toBeNull()
    expect(result!.user_id).toBe(mod.id)
    expect(result!.ends_at).toBeNull()
    const settings = await getMyCommunityVacationSettings(
      mod.id,
      { communityId: community.id },
      { clock },
    )
    expect(settings.vacation).toEqual(result)
    expect(settings.should_suppress_community_digests_while_on_vacation).toBe(false)

    const endsAt = new Date(logicalTime.getTime() + 86_400_000)
    await setMyCommunityVacation(
      mod.id,
      { communityId: community.id, endsAt: endsAt.toISOString() },
      { clock },
    )
    const finite = await getMyCommunityVacation(mod.id, { communityId: community.id }, { clock })
    expect(finite).not.toBeNull()
    expect(finite!.ends_at).toEqual(endsAt)
    const finiteSettings = await getMyCommunityVacationSettings(
      mod.id,
      { communityId: community.id },
      { clock },
    )
    expect(finiteSettings.vacation).toEqual(finite)

    const endClock = () => new Date(endsAt)
    expect(
      await getMyCommunityVacation(mod.id, { communityId: community.id }, { clock: endClock }),
    ).toBeNull()
    const endedSettings = await getMyCommunityVacationSettings(
      mod.id,
      { communityId: community.id },
      { clock: endClock },
    )
    expect(endedSettings.vacation).toBeNull()
    expect(endedSettings.should_suppress_community_digests_while_on_vacation).toBe(false)
  })

  it('returns null when vacation has expired (ends_at in the past)', async () => {
    const community = await createTestCommunity(mod.id)
    const expiredEndsAt = new Date(logicalTime.getTime() - 1000).toISOString()
    await setMyCommunityVacation(
      mod.id,
      { communityId: community.id, endsAt: expiredEndsAt },
      { clock },
    )

    const result = await getMyCommunityVacation(mod.id, { communityId: community.id }, { clock })
    expect(result).toBeNull()
    const settings = await getMyCommunityVacationSettings(
      mod.id,
      { communityId: community.id },
      { clock },
    )
    expect(settings.vacation).toBeNull()
    expect(settings.should_suppress_community_digests_while_on_vacation).toBe(false)
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
      should_suppress_community_digests_while_on_vacation: false,
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
    expect(settings.should_suppress_community_digests_while_on_vacation).toBe(true)
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
    expect(settings.should_suppress_community_digests_while_on_vacation).toBe(true)
  })
})

describe('community vacation clock validation', () => {
  const clockError = new Error('Owned vacation clock failure')
  it.each([
    {
      name: 'throwing',
      clock: (): Date => {
        throw clockError
      },
      error: clockError,
    },
    {
      name: 'invalid',
      clock: () => new Date(Number.NaN),
      error: new RangeError('Community vacation clock must return a valid Date'),
    },
  ])('rejects a $name clock before writing', async ({ clock: invalidClock, error }) => {
    const mod = await createTestUser()
    const community = await createTestCommunity(mod.id)
    await expect(
      setMyCommunityVacation(mod.id, { communityId: community.id }, { clock: invalidClock }),
    ).rejects.toThrow(error)
    expect(await getMyCommunityVacation(mod.id, { communityId: community.id })).toBeNull()
    const settings = await getMyCommunityVacationSettings(mod.id, { communityId: community.id })
    expect(settings.vacation).toBeNull()
    expect(settings.should_suppress_community_digests_while_on_vacation).toBe(false)
  })
})
