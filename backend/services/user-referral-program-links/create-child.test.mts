import { beforeAll, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import type { PrivateUser } from '@services/users/types'
import { createReferralProgramFixture, createTestUser } from '@voucha/test-helpers'
import { createUserReferralLink } from './create.mts'
import { createChildReferralLink } from './create-child.mts'
import { getUserReferralLink } from './get.mts'

describe('create-child', () => {
  let user: PrivateUser
  let userId: string | null = null
  let referralProgramId: string | null = null
  let otherReferralProgramId: string | null = null
  let testHostname: string | null = null
  let parentLinkId: string | null = null

  beforeAll(async () => {
    const testUser = await createTestUser()
    user = testUser
    userId = user.id
    const randomSuffix = Math.random().toString(36).slice(7)
    testHostname = `create-child-test-${randomSuffix}.com`

    const fixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix,
      hostname: testHostname,
      pathname: '/refer',
    })
    referralProgramId = fixture.referralProgramId

    const otherFixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: `${randomSuffix}other`,
    })
    otherReferralProgramId = otherFixture.referralProgramId

    const parent = await createUserReferralLink(user, {
      user_id: userId,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/refer?test=parent`,
      label: 'Parent link',
    })
    parentLinkId = parent.id
  })

  it('creates a child link pointing at its parent', async () => {
    const child = await createChildReferralLink(userId!, {
      userId: userId!,
      referralProgramId: referralProgramId!,
      url: `https://${testHostname}/refer?test=child1`,
      parentLinkId: parentLinkId!,
      label: 'Gold Card',
    })

    assert.ok(child.id)
    assert.equal(child.user_id, userId)
    assert.equal(child.referral_program_id, referralProgramId)
    assert.equal(child.parent_link_id, parentLinkId)
    assert.equal(child.label, 'Gold Card')
    assert.ok(child.activated_at)
  })

  it('rejects a URL that does not match the specified referral program', async () => {
    await assert.rejects(
      () =>
        createChildReferralLink(userId!, {
          userId: userId!,
          referralProgramId: otherReferralProgramId!,
          url: `https://${testHostname}/refer?test=wrong-program`,
          parentLinkId: parentLinkId!,
        }),
      { status: 422 },
    )
  })

  it('re-running with the same URL is idempotent and re-activates the child', async () => {
    const url = `https://${testHostname}/refer?test=idempotent`
    const first = await createChildReferralLink(userId!, {
      userId: userId!,
      referralProgramId: referralProgramId!,
      url,
      parentLinkId: parentLinkId!,
      label: 'First label',
    })

    const second = await createChildReferralLink(userId!, {
      userId: userId!,
      referralProgramId: referralProgramId!,
      url,
      parentLinkId: parentLinkId!,
      label: 'Second label',
    })

    assert.equal(second.id, first.id)
    assert.equal(second.parent_link_id, parentLinkId)
    assert.equal(second.label, 'Second label')
    assert.ok(second.activated_at)
  })

  it('never hijacks a manually-added link with the same user/program/url', async () => {
    const url = `https://${testHostname}/refer?test=manual`
    const manual = await createUserReferralLink(user, {
      user_id: userId!,
      referral_program_id: referralProgramId!,
      url,
      label: 'Manually added',
    })

    await assert.rejects(
      () =>
        createChildReferralLink(userId!, {
          userId: userId!,
          referralProgramId: referralProgramId!,
          url,
          parentLinkId: parentLinkId!,
          label: 'Should not overwrite',
        }),
      { status: 409 },
    )

    const stillManual = await getUserReferralLink(manual.id)
    assert.ok(stillManual)
    assert.equal(stillManual.parent_link_id, null)
    assert.equal(stillManual.label, 'Manually added')
  })
})
