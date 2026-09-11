import { describe, it, expect } from 'vitest'

import {
  createTestUser,
  followUser,
  muteUser,
  blockUser,
  insertTestReferralProgram,
  insertTestUserReferralProgramLink,
  createTestUrlWithHostname,
} from '@voucha/test-helpers'
import {
  createTestMembership,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers/entities/memberships'

import { encodeCursor } from '@modules/pagination'

import { getReferralLinksFeed } from './get.mts'

describe('getReferralLinksFeed', () => {
  it('returns empty results when user has no follows', async () => {
    const viewer = await createTestUser()

    const result = await getReferralLinksFeed(viewer, 'follow_users')

    expect(result.results).toEqual([])
    expect(result.page_info.has_next_page).toBe(false)
  })

  it('returns links from followed users', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    await followUser(viewer, friend)

    const referralProgramId = await insertTestReferralProgram({ createdById: friend.id })
    const urlId = await createTestUrlWithHostname()
    const linkId = await insertTestUserReferralProgramLink({
      userId: friend.id,
      referralProgramId,
      urlId,
    })

    const result = await getReferralLinksFeed(viewer, 'follow_users', { limit: 100 })

    const found = result.results.find(r => r.id === linkId)
    expect(found).toBeDefined()
    expect(found?.user_id).toBe(friend.id)
  })

  it('excludes own links', async () => {
    const viewer = await createTestUser()

    const referralProgramId = await insertTestReferralProgram({ createdById: viewer.id })
    const urlId = await createTestUrlWithHostname()
    const linkId = await insertTestUserReferralProgramLink({
      userId: viewer.id,
      referralProgramId,
      urlId,
    })

    const result = await getReferralLinksFeed(viewer, 'follow_users', { limit: 100 })

    const found = result.results.find(r => r.id === linkId)
    expect(found).toBeUndefined()
  })

  it('excludes muted users', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    await followUser(viewer, friend)
    await muteUser(viewer, friend)

    const referralProgramId = await insertTestReferralProgram({ createdById: friend.id })
    const urlId = await createTestUrlWithHostname()
    const linkId = await insertTestUserReferralProgramLink({
      userId: friend.id,
      referralProgramId,
      urlId,
    })

    const result = await getReferralLinksFeed(viewer, 'follow_users', { limit: 100 })

    const found = result.results.find(r => r.id === linkId)
    expect(found).toBeUndefined()
  })

  it('excludes blocked users', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    await followUser(viewer, friend)
    await blockUser(viewer, friend)

    const referralProgramId = await insertTestReferralProgram({ createdById: friend.id })
    const urlId = await createTestUrlWithHostname()
    const linkId = await insertTestUserReferralProgramLink({
      userId: friend.id,
      referralProgramId,
      urlId,
    })

    const result = await getReferralLinksFeed(viewer, 'follow_users', { limit: 100 })

    const found = result.results.find(r => r.id === linkId)
    expect(found).toBeUndefined()
  })

  it('mutual_follows returns only mutual follow links', async () => {
    const viewer = await createTestUser()
    const oneWay = await createTestUser()
    const mutual = await createTestUser()

    // viewer follows oneWay, but oneWay does NOT follow back
    await followUser(viewer, oneWay)

    // viewer and mutual follow each other
    await followUser(viewer, mutual)
    await followUser(mutual, viewer)

    const programIdOneWay = await insertTestReferralProgram({ createdById: oneWay.id })
    const urlIdOneWay = await createTestUrlWithHostname()
    const linkIdOneWay = await insertTestUserReferralProgramLink({
      userId: oneWay.id,
      referralProgramId: programIdOneWay,
      urlId: urlIdOneWay,
    })

    const programIdMutual = await insertTestReferralProgram({ createdById: mutual.id })
    const urlIdMutual = await createTestUrlWithHostname()
    const linkIdMutual = await insertTestUserReferralProgramLink({
      userId: mutual.id,
      referralProgramId: programIdMutual,
      urlId: urlIdMutual,
    })

    const result = await getReferralLinksFeed(viewer, 'mutual_follows', { limit: 100 })

    const foundOneWay = result.results.find(r => r.id === linkIdOneWay)
    const foundMutual = result.results.find(r => r.id === linkIdMutual)

    expect(foundOneWay).toBeUndefined()
    expect(foundMutual).toBeDefined()
  })

  it('throws 400 for invalid cursor shape', async () => {
    const viewer = await createTestUser()
    const badCursor = Buffer.from(JSON.stringify({ wrong: 'thing' })).toString('base64')

    await expect(
      getReferralLinksFeed(viewer, 'follow_users', { after: badCursor }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 for non-UUID cursor id', async () => {
    const viewer = await createTestUser()
    const badCursor = Buffer.from(JSON.stringify({ id: 'not-a-uuid' })).toString('base64')

    await expect(
      getReferralLinksFeed(viewer, 'follow_users', { after: badCursor }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('deduplicates multiple active links for the same user/program', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    await followUser(viewer, friend)

    const referralProgramId = await insertTestReferralProgram({ createdById: friend.id })
    for (let i = 0; i < 3; i++) {
      const urlId = await createTestUrlWithHostname()
      await insertTestUserReferralProgramLink({
        userId: friend.id,
        referralProgramId,
        urlId,
      })
    }

    const result = await getReferralLinksFeed(viewer, 'follow_users', { limit: 100 })

    const found = result.results.filter(
      r => r.user_id === friend.id && r.referral_program_id === referralProgramId,
    )
    expect(found.length).toBe(1)
  })

  it('pagination: returns hasNextPage when there are more results', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    await followUser(viewer, friend)

    for (let i = 0; i < 3; i++) {
      const referralProgramId = await insertTestReferralProgram({ createdById: friend.id })
      const urlId = await createTestUrlWithHostname()
      await insertTestUserReferralProgramLink({
        userId: friend.id,
        referralProgramId,
        urlId,
      })
    }

    const result = await getReferralLinksFeed(viewer, 'follow_users', { limit: 2 })

    expect(result.results.length).toBe(2)
    expect(result.page_info.has_next_page).toBe(true)
    expect(result.page_info.end_cursor).toBeTruthy()
  })

  it('pagination: cursor excludes items before it', async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    await followUser(viewer, friend)

    for (let i = 0; i < 2; i++) {
      const referralProgramId = await insertTestReferralProgram({ createdById: friend.id })
      const urlId = await createTestUrlWithHostname()
      await insertTestUserReferralProgramLink({
        userId: friend.id,
        referralProgramId,
        urlId,
      })
    }

    const page1 = await getReferralLinksFeed(viewer, 'follow_users', { limit: 1 })
    expect(page1.results.length).toBe(1)
    expect(page1.page_info.end_cursor).toBeTruthy()

    const page2 = await getReferralLinksFeed(viewer, 'follow_users', {
      limit: 1,
      after: page1.page_info.end_cursor!,
    })

    expect(page2.results.length).toBe(1)
    expect(page2.results[0]!.id).not.toBe(page1.results[0]!.id)
  })

  it("hides a child link once the owner's membership expires_at lapses, while a parent link stays visible", async () => {
    const viewer = await createTestUser()
    const friend = await createTestUser()
    await followUser(viewer, friend)

    const membership = await createTestMembership({ user_id: friend.id, plan: 'plus' })

    const parentProgramId = await insertTestReferralProgram({ createdById: friend.id })
    const parentUrlId = await createTestUrlWithHostname()
    const parentId = await insertTestUserReferralProgramLink({
      userId: friend.id,
      referralProgramId: parentProgramId,
      urlId: parentUrlId,
    })

    const childProgramId = await insertTestReferralProgram({ createdById: friend.id })
    const childUrlId = await createTestUrlWithHostname()
    const childId = await insertTestUserReferralProgramLink({
      userId: friend.id,
      referralProgramId: childProgramId,
      urlId: childUrlId,
      parentLinkId: parentId,
    })

    // Before: friend's plus membership is active and not expired -> the child is visible.
    const before = await getReferralLinksFeed(viewer, 'follow_users', { limit: 100 })
    expect(before.results.some(r => r.id === parentId)).toBe(true)
    expect(before.results.some(r => r.id === childId)).toBe(true)

    // Simulate a granted/comp membership lapsing purely by time: only expires_at moves,
    // cancelled_at/expired_at/paused_at stay NULL (no Stripe event fires for this case).
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 24 * 60 * 60 * 1000))

    // After: the same child must now be hidden; the parent (parent_link_id IS NULL) is unaffected.
    const after = await getReferralLinksFeed(viewer, 'follow_users', { limit: 100 })
    expect(after.results.some(r => r.id === parentId)).toBe(true)
    expect(after.results.some(r => r.id === childId)).toBe(false)
  })

  // keep encodeCursor import live for typecheck
  void (0 as unknown as typeof encodeCursor)
})
