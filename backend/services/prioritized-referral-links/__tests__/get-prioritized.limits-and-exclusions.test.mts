import { beforeEach, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  insertTestLocalFollow,
  insertTestMute,
  insertTestBlock,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  activateUserReferralLink,
  createUserReferralLink,
  deactivateUserReferralLink,
  deleteUserReferralLink,
} from '@services/user-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'

let referralProgramId: string

let testHostname: string

async function createUserWithLink(
  labelPrefix: string,
): Promise<{ user: PrivateUser; linkId: string }> {
  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')
  const suffix = createRandomString(8)
  const link = await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${labelPrefix}-${suffix}`,
    label: `${labelPrefix} link`,
  })
  return { user, linkId: link.id }
}

describe('get-prioritized shared list, exclusions and cache', () => {
  // Each test gets its own program so the shared out-of-network list holds only its own links.
  beforeEach(async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = createRandomString(8)
    testHostname = `prioritized-test-${suffix}.example.com`
    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  })

  it('gives anonymous viewers the top five shared links in group 5', async () => {
    await Promise.all(Array.from({ length: 7 }, () => createUserWithLink('anon')))

    const result = await getPrioritizedReferralLinks(null, referralProgramId)

    expect(result.links).toHaveLength(5)
    expect(result.links.every(l => l.priority_group === 5)).toBe(true)
  })

  it('fills a viewer with no network from the shared links, up to five', async () => {
    const viewer = await createTestUser()
    await Promise.all(Array.from({ length: 7 }, () => createUserWithLink('fill')))

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links).toHaveLength(5)
    expect(result.links.every(l => l.priority_group === 5)).toBe(true)
  })

  it('removes muted and blocked users and the viewer from the shared list', async () => {
    const [viewer, { user: mutedUser }, { user: blockedUser }, { user: shown }] = await Promise.all(
      [
        createTestUser(),
        createUserWithLink('muted'),
        createUserWithLink('blocked'),
        createUserWithLink('shown'),
      ],
    )
    await Promise.all([
      insertTestMute(viewer.id, mutedUser.id),
      insertTestBlock(viewer.id, blockedUser.id),
      createUserReferralLink(viewer, WEB_PROVENANCE, {
        user_id: viewer.id,
        referral_program_id: referralProgramId,
        url: `https://${testHostname}/ref/self-${createRandomString(8)}`,
        label: 'Self link',
      }),
    ])

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links.map(l => l.user_id)).toEqual([shown.id])
  })

  it('removes muted and blocked users from the network too', async () => {
    const [viewer, { user: mutedFriend }, { user: friend }] = await Promise.all([
      createTestUser(),
      createUserWithLink('muted-friend'),
      createUserWithLink('friend'),
    ])
    await Promise.all([
      insertTestLocalFollow(viewer.id, mutedFriend.id),
      insertTestLocalFollow(viewer.id, friend.id),
      insertTestMute(viewer.id, mutedFriend.id),
    ])

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links.map(l => l.user_id)).toEqual([friend.id])
  })

  it('populates the users map for every returned link', async () => {
    const [viewer, { user: linkUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink('user-details'),
    ])

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links.map(l => l.user_id)).toEqual([linkUser.id])
    expect(result.users[linkUser.id]?.username).toBeTruthy()
    expect(Object.keys(result.users)).toEqual([linkUser.id])
  })

  it('serves a cached list until a link is added, deactivated, reactivated or deleted', async () => {
    const viewer = await createTestUser()
    const first = await createUserWithLink('cache-first')
    const idsOf = async () =>
      (await getPrioritizedReferralLinks(viewer.id, referralProgramId)).links.map(l => l.id)
    expect(await idsOf()).toEqual([first.linkId])

    const second = await createUserWithLink('cache-second')
    expect(await idsOf()).toEqual(expect.arrayContaining([first.linkId, second.linkId]))

    await deactivateUserReferralLink(first.user as PrivateUser, first.linkId)
    expect(await idsOf()).toEqual([second.linkId])

    await activateUserReferralLink(first.user as PrivateUser, first.linkId)
    expect(await idsOf()).toEqual(expect.arrayContaining([first.linkId, second.linkId]))

    await deleteUserReferralLink(second.user as PrivateUser, second.linkId)
    expect(await idsOf()).toEqual([first.linkId])
  })
})
