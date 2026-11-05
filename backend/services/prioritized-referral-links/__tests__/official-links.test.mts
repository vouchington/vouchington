import { beforeEach, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createTestUser,
  createRandomString,
  insertTestLocalFollow,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { upsertSystemUser } from '@services/users/system-users'
import { createUserReferralLink } from '@services/user-referral-program-links'
import {
  createOfficialReferralLink,
  deleteOfficialReferralLink,
} from '@services/official-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'
import { getAllReferralLinksPage } from '../show-all.mts'

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

  it('lists official links in group 0 with the official account in the users map', async () => {
    const link = await createOfficialLink('official')
    const viewer = await createTestUser()

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    const official = result.links.find(l => l.id === link.id)
    expect(official).toMatchObject({
      priority_group: 0,
      is_official: true,
      referral_program_id: referralProgramId,
    })
    expect(result.users[official!.user_id!]).toBeDefined()
    const page = await getAllReferralLinksPage(viewer.id, referralProgramId)
    expect(page.links.find(l => l.id === link.id)).toMatchObject({
      priority_group: 0,
      is_official: true,
    })
  })

  it('puts official links before personal links, and keeps them for viewers with a network', async () => {
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
      [true, 0],
      [false, 5],
    ])

    await insertTestLocalFollow(viewer.id, personalUser.id)
    const withNetwork = await getPrioritizedReferralLinks(viewer.id, referralProgramId)
    expect(withNetwork.links.map(l => [l.id === officialId, l.priority_group])).toEqual([
      [true, 0],
      [false, 2],
    ])
  })

  it('stops listing an official link once it is deleted', async () => {
    const link = await createOfficialLink('official-deleted')
    expect((await getPrioritizedReferralLinks(null, referralProgramId)).links).toHaveLength(1)

    await deleteOfficialReferralLink(admin, link.id)

    expect((await getPrioritizedReferralLinks(null, referralProgramId)).links).toHaveLength(0)
  })
})
