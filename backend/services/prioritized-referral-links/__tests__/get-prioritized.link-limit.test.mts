import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  insertTestLocalFollow,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'
import { prioritizedReferralLinksWorkConfig } from '../work-limits.mts'

let referralProgramId: string
let testHostname: string

async function createAuthorWithLink(label: string) {
  const user = await createTestUser()
  await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${label}-${createRandomString(8)}`,
    label: `${label} link`,
  })
  return user
}

describe('get-prioritized personalized link limit', () => {
  beforeEach(async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = createRandomString(8)
    testHostname = `link-limit-${suffix}.example.com`
    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
    onTestFinished(
      overrideDynamicConfigFieldsForTest(prioritizedReferralLinksWorkConfig, {
        personalized_link_limit: 3,
      }),
    )
  })

  it('caps in-network links at the configured limit', async () => {
    const [viewer, ...authors] = await Promise.all([
      createTestUser(),
      ...Array.from({ length: 5 }, (_, i) => createAuthorWithLink(`followed-${i}`)),
    ])
    await Promise.all(authors.map(author => insertTestLocalFollow(viewer.id, author.id)))

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links).toHaveLength(3)
  })

  it('caps the shared out-of-network links at the same limit', async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) => createAuthorWithLink(`other-${i}`)))

    const result = await getPrioritizedReferralLinks(null, referralProgramId)

    expect(result.links).toHaveLength(3)
  })

  it('does not let followees without a program link use up the follow group', async () => {
    const viewer = await createTestUser()
    const withoutLinks = await Promise.all(Array.from({ length: 4 }, () => createTestUser()))
    const withLinks = await Promise.all(
      Array.from({ length: 2 }, (_, i) => createAuthorWithLink(`linked-${i}`)),
    )
    await Promise.all(
      [...withoutLinks, ...withLinks].map(user => insertTestLocalFollow(viewer.id, user.id)),
    )

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links.map(l => l.user_id).toSorted()).toEqual(withLinks.map(u => u.id).toSorted())
  })

  it('does not let a full follow group hide a mutual follow', async () => {
    const viewer = await createTestUser()
    const mutual = await createAuthorWithLink('mutual')
    const followed = []
    for (let i = 0; i < 4; i++) followed.push(await createAuthorWithLink(`followed-${i}`))
    await Promise.all([
      insertTestLocalFollow(viewer.id, mutual.id),
      insertTestLocalFollow(mutual.id, viewer.id),
      ...followed.map(user => insertTestLocalFollow(viewer.id, user.id)),
    ])

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links).toHaveLength(3)
    expect(result.links[0]).toMatchObject({ user_id: mutual.id, priority_group: 1 })
  })
})
