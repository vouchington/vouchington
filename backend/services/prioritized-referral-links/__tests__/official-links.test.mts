import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createTestUser,
  createRandomString,
  insertTestLocalFollow,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { upsertSystemUser } from '@services/users/system-users'
import { createUserReferralLink } from '@services/user-referral-program-links'
import {
  createOfficialReferralLink,
  deleteOfficialReferralLink,
} from '@services/official-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'
import { getAllReferralLinksPage } from '../show-all.mts'
import { prioritizedReferralLinksWorkConfig } from '../work-limits.mts'

describe('getPrioritizedReferralLinks — official links', () => {
  let admin: PrivateUser
  let referralProgramId: string
  let testHostname: string

  beforeEach(async () => {
    await upsertSystemUser('voucha', 'official')
    admin = await createTestUser({ administrator: true })
    const suffix = createRandomString(8)
    testHostname = `official-prioritized-${suffix}.example.com`
    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  })

  async function createOfficialLink(label: string) {
    return createOfficialReferralLink(admin, WEB_PROVENANCE, {
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/${label}-${createRandomString(8)}`,
      label,
    })
  }

  it('lists official links in group 5 with the official account in the users map', async () => {
    const link = await createOfficialLink('official')
    const viewer = await createTestUser()

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    const official = result.links.find(l => l.id === link.id)
    expect(official).toMatchObject({
      priority_group: 5,
      is_official: true,
      referral_program_id: referralProgramId,
    })
    expect(result.users[official!.user_id!]).toBeDefined()
    const page = await getAllReferralLinksPage(viewer.id, referralProgramId)
    expect(page.links.find(l => l.id === link.id)).toMatchObject({
      priority_group: 5,
      is_official: true,
    })
  })

  it('ranks official links after network links and before everyone else, in default mode', async () => {
    const [{ id: officialId }, personalUser, viewer] = await Promise.all([
      createOfficialLink('official-order'),
      createTestUser(),
      createTestUser(),
    ])
    await createUserReferralLink(personalUser, WEB_PROVENANCE, {
      user_id: personalUser.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/personal-${createRandomString(8)}`,
    })

    const stranger = await getPrioritizedReferralLinks(viewer.id, referralProgramId)
    expect(stranger.links.map(l => [l.id === officialId, l.priority_group])).toEqual([
      [true, 5],
      [false, 6],
    ])

    await insertTestLocalFollow(viewer.id, personalUser.id)
    const withNetwork = await getPrioritizedReferralLinks(viewer.id, referralProgramId)
    expect(withNetwork.links.map(l => [l.id === officialId, l.priority_group])).toEqual([
      [false, 2],
      [true, 5],
    ])
  })

  it('keeps official links when the personalized limit is exhausted, after the network links', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(prioritizedReferralLinksWorkConfig, {
        personalized_link_limit: 1,
      }),
    )
    const [{ id: officialId }, first, second, viewer] = await Promise.all([
      createOfficialLink('official-limit'),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    await Promise.all(
      [first, second].map(user =>
        createUserReferralLink(user, WEB_PROVENANCE, {
          user_id: user.id,
          referral_program_id: referralProgramId,
          url: `https://${testHostname}/ref/limit-${createRandomString(8)}`,
        }),
      ),
    )
    await Promise.all([first, second].map(user => insertTestLocalFollow(viewer.id, user.id)))

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links.map(l => [l.id === officialId, l.priority_group])).toEqual([
      [false, 2],
      [true, 5],
    ])
  })

  it('stops listing an official link once it is deleted', async () => {
    const link = await createOfficialLink('official-deleted')
    expect((await getPrioritizedReferralLinks(null, referralProgramId)).links).toHaveLength(1)

    await deleteOfficialReferralLink(admin, link.id)

    expect((await getPrioritizedReferralLinks(null, referralProgramId)).links).toHaveLength(0)
  })
})
