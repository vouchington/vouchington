import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { recordMediaReveal } from '../record.mts'
import { getExposureState } from '../get.mts'
import { EXPOSURE_BREAK_THRESHOLD } from '../config.mts'

describe('getExposureState - fresh moderator', () => {
  let moderator: PrivateUser

  beforeAll(async () => {
    moderator = await createTestUser()
  })

  it('returns count=0 and no cooldown when moderator has no reveals', async () => {
    const state = await getExposureState(moderator.id)
    expect(state.count).toBe(0)
    expect(state.threshold).toBe(EXPOSURE_BREAK_THRESHOLD)
    expect(state.in_cooldown).toBe(false)
    expect(state.cooldown_ends_at).toBeNull()
  })
})

describe('getExposureState - DISTINCT entity deduplication', () => {
  let moderator: PrivateUser
  let postAuthor: PrivateUser

  beforeAll(async () => {
    moderator = await createTestUser()
    postAuthor = await createTestUser()
  })

  it('counts the same post revealed on two surfaces as one distinct entity', async () => {
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `exposure-dedup-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Exposure Dedup Test',
      markdown: 'body',
    })

    await recordMediaReveal(moderator.id, { postId, surface: 'mod_queue' })
    await recordMediaReveal(moderator.id, { postId, surface: 'post_page' })

    const state = await getExposureState(moderator.id)
    expect(state.count).toBe(1)
  })

  it('counts different posts as separate distinct entities', async () => {
    const postId1 = await insertTestPost({
      createdById: postAuthor.id,
      slug: `exposure-distinct-a-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Exposure Distinct A',
      markdown: 'body',
    })
    const postId2 = await insertTestPost({
      createdById: postAuthor.id,
      slug: `exposure-distinct-b-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Exposure Distinct B',
      markdown: 'body',
    })

    const before = await getExposureState(moderator.id)
    await recordMediaReveal(moderator.id, { postId: postId1, surface: 'mod_queue' })
    await recordMediaReveal(moderator.id, { postId: postId2, surface: 'mod_queue' })

    const after = await getExposureState(moderator.id)
    expect(after.count).toBe(before.count + 2)
  })
})

describe('getExposureState - cooldown at threshold', () => {
  let moderator: PrivateUser

  beforeAll(async () => {
    moderator = await createTestUser()
    // Insert exactly EXPOSURE_BREAK_THRESHOLD reveals with null postId/reportId
    // so each row uses its own UUID as the entity key — all distinct.
    for (let i = 0; i < EXPOSURE_BREAK_THRESHOLD; i++) {
      await recordMediaReveal(moderator.id, { surface: 'mod_queue' })
    }
  })

  it('enters cooldown when distinct reveal count reaches threshold', async () => {
    const state = await getExposureState(moderator.id)
    expect(state.count).toBe(EXPOSURE_BREAK_THRESHOLD)
    expect(state.in_cooldown).toBe(true)
    expect(state.cooldown_ends_at).not.toBeNull()
  })

  it('provides a cooldown_ends_at timestamp in the future', async () => {
    const state = await getExposureState(moderator.id)
    expect(state.cooldown_ends_at).not.toBeNull()
    const cooldownEnds = new Date(state.cooldown_ends_at!).getTime()
    expect(cooldownEnds).toBeGreaterThan(Date.now())
  })
})

describe('getExposureState - isolated per moderator', () => {
  let mod1: PrivateUser
  let mod2: PrivateUser

  beforeAll(async () => {
    mod1 = await createTestUser()
    mod2 = await createTestUser()
    await recordMediaReveal(mod1.id, { surface: 'review_queue' })
  })

  it("does not count another moderator's reveals toward the state", async () => {
    const state = await getExposureState(mod2.id)
    expect(state.count).toBe(0)
  })
})
