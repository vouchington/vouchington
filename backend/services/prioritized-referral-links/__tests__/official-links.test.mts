import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createTestUser,
  createRandomString,
} from '@voucha/test-helpers'
import { upsertSystemUser } from '@services/users/system-users'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { createOfficialReferralLink } from '@services/official-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'

describe('getPrioritizedReferralLinks — official links', () => {
  let admin: PrivateUser
  let referralProgramId: string
  let testHostname: string

  beforeAll(async () => {
    // Ensure the @voucha system user exists
    await upsertSystemUser('voucha')

    const adminUser = await createTestUser({ administrator: true })
    if (!adminUser) throw new Error('Failed to create admin user')
    admin = adminUser

    const suffix = createRandomString(8)
    testHostname = `official-prioritized-${suffix}.example.com`

    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  }, 30_000)

  it('official links appear as priority_group 0 and is_official true', async () => {
    const suffix = createRandomString(8)
    const link = await createOfficialReferralLink(admin, {
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/official-${suffix}`,
      label: 'Official link',
    })

    const viewer = await createTestUser()
    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    const officialLinks = result.links.filter(l => l.is_official)
    const thisLink = officialLinks.find(l => l.id === link.id)
    expect(thisLink).toBeDefined()
    expect(thisLink!.priority_group).toBe(0)
    expect(thisLink!.is_official).toBe(true)
  }, 30_000)

  it('official links appear before personal links', async () => {
    const suffix = createRandomString(8)

    // Create a personal link for a regular user
    const personalUser = await createTestUser()
    if (!personalUser) throw new Error('Failed to create personal user')
    await createUserReferralLink(personalUser, {
      user_id: personalUser.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/personal-${suffix}`,
      label: 'Personal link',
    })

    // Create an official link
    const officialSuffix = createRandomString(8)
    await createOfficialReferralLink(admin, {
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/official-order-${officialSuffix}`,
    })

    const viewer = await createTestUser()
    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    expect(result.links.length).toBeGreaterThan(0)

    // Official links (group 0) come first
    const firstNonOfficialIdx = result.links.findIndex(l => !l.is_official)
    const lastOfficialIdx = result.links.map(l => l.is_official).lastIndexOf(true)

    expect(lastOfficialIdx).toBeGreaterThanOrEqual(0)
    expect(firstNonOfficialIdx).toBeGreaterThanOrEqual(0)
    expect(lastOfficialIdx).toBeLessThan(firstNonOfficialIdx)
  }, 30_000)

  it('personal links still appear in groups 1-5', async () => {
    const suffix = createRandomString(8)

    const personalUser = await createTestUser()
    if (!personalUser) throw new Error('Failed to create personal user')
    await createUserReferralLink(personalUser, {
      user_id: personalUser.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/personal-groups-${suffix}`,
    })

    const viewer = await createTestUser()
    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    const personalLinks = result.links.filter(l => !l.is_official)
    const personalLink = personalLinks.find(l => l.user_id === personalUser.id)
    expect(personalLink).toBeDefined()
    expect(personalLink!.priority_group).toBeGreaterThanOrEqual(1)
    expect(personalLink!.priority_group).toBeLessThanOrEqual(5)
  }, 30_000)

  it('collectUsers does not fail for official links (user_id is not null for voucha)', async () => {
    const suffix = createRandomString(8)
    await createOfficialReferralLink(admin, {
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/users-check-${suffix}`,
    })

    const viewer = await createTestUser()
    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    // Should not throw; official links have a real user_id (voucha user)
    const officialLinks = result.links.filter(l => l.is_official)
    expect(officialLinks.length).toBeGreaterThan(0)
    for (const link of officialLinks) {
      // user_id is set to voucha's actual user id (not null)
      expect(link.user_id).toBeTruthy()
    }
  }, 30_000)
})
