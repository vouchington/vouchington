import { beforeEach, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  insertTestBlock,
  insertTestMute,
  insertTestReferralProgram,
  insertTestUserReferralProgramLink,
  createTestUrlWithHostname,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createTestMembership,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers/entities/memberships'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { getAllReferralLinksPage } from '../show-all.mts'

let admin: PrivateUser

let referralProgramId: string

let testHostname: string

async function createUserWithLink(
  labelPrefix: string,
): Promise<{ user: PrivateUser; linkId: string }> {
  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')
  const link = await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${labelPrefix}-${createRandomString(8)}`,
    label: `${labelPrefix} link`,
  })
  return { user, linkId: link.id }
}

describe('getAllReferralLinksPage', () => {
  beforeEach(async () => {
    admin = await createTestUser({ administrator: true })
    const suffix = createRandomString(8)
    testHostname = `all-page-${suffix}.example.com`
    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  })

  it('lists every visible link newest first, including the viewer’s own', async () => {
    const viewer = await createTestUser()
    const own = await createUserReferralLink(viewer, WEB_PROVENANCE, {
      user_id: viewer.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/own-${createRandomString(8)}`,
      label: 'Own link',
    })
    const other = await createUserWithLink('other')
    const [mutedLink, blockedLink] = await Promise.all([
      createUserWithLink('muted'),
      createUserWithLink('blocked'),
    ])
    await Promise.all([
      insertTestMute(viewer.id, mutedLink.user.id),
      insertTestBlock(viewer.id, blockedLink.user.id),
    ])

    const page = await getAllReferralLinksPage(viewer.id, referralProgramId)

    expect(page.links.map(l => l.id)).toEqual([other.linkId, own.id])
    expect(page.links.every(l => l.priority_group === 5 && !l.is_official)).toBe(true)
    expect(page.users[other.user.id]?.username).toBeTruthy()
    expect(page.page_info.has_next_page).toBe(false)
  })

  it('pages with a keyset cursor and no overlap', async () => {
    const viewer = await createTestUser()
    const created = []
    for (let index = 0; index < 5; index++) created.push(await createUserWithLink('paged'))
    const newestFirst = created.map(item => item.linkId).toReversed()

    const first = await getAllReferralLinksPage(viewer.id, referralProgramId, { limit: 2 })
    expect(first.links.map(l => l.id)).toEqual(newestFirst.slice(0, 2))
    expect(first.page_info.has_next_page).toBe(true)

    const second = await getAllReferralLinksPage(viewer.id, referralProgramId, {
      limit: 2,
      after: first.page_info.end_cursor!,
    })
    expect(second.links.map(l => l.id)).toEqual(newestFirst.slice(2, 4))

    const third = await getAllReferralLinksPage(viewer.id, referralProgramId, {
      limit: 2,
      after: second.page_info.end_cursor!,
    })
    expect(third.links.map(l => l.id)).toEqual(newestFirst.slice(4))
    expect(third.page_info.has_next_page).toBe(false)
    expect(third.page_info.end_cursor).toBeNull()
  })

  it('rejects a malformed cursor', async () => {
    const viewer = await createTestUser()

    await expect(
      getAllReferralLinksPage(viewer.id, referralProgramId, { after: 'not-a-cursor' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it("hides a child link once the owner's membership lapses, but not an unrelated link", async () => {
    const viewer = await createTestUser()
    const control = await createUserWithLink('membership-control')
    const childOwner = await createTestUser()
    const membership = await createTestMembership({ user_id: childOwner.id, plan: 'plus' })
    // The parent lives under another program; only its id is needed for parent_link_id.
    const parentId = await insertTestUserReferralProgramLink({
      userId: childOwner.id,
      referralProgramId: await insertTestReferralProgram({ createdById: admin.id }),
      urlId: await createTestUrlWithHostname(),
    })
    const childId = await insertTestUserReferralProgramLink({
      userId: childOwner.id,
      referralProgramId,
      urlId: await createTestUrlWithHostname(),
      parentLinkId: parentId,
    })

    const before = await getAllReferralLinksPage(viewer.id, referralProgramId)
    expect(before.links.map(l => l.id)).toEqual(expect.arrayContaining([childId, control.linkId]))

    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 24 * 60 * 60 * 1000))

    const after = await getAllReferralLinksPage(viewer.id, referralProgramId)
    expect(after.links.map(l => l.id)).toEqual([control.linkId])
  })
})
