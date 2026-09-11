import { it, beforeAll, describe } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import assert from 'node:assert/strict'
import { createReferralProgramFixture, createTestUser } from '@voucha/test-helpers'
import { activateUserReferralLink, deactivateUserReferralLink } from './activate.mts'
import { createUserReferralLink } from './create.mts'
import { createChildReferralLink } from './create-child.mts'

describe('activate', () => {
  let user: PrivateUser
  let referralProgramId: string | null = null
  let linkId: string | null = null
  let hostname: string | null = null

  beforeAll(async () => {
    const testUser = await createTestUser()
    if (!testUser) throw new Error('Failed to create test user')
    user = testUser
    const randomSuffix = Math.random().toString(36).slice(7)

    hostname = `activate-test-${randomSuffix}.com`
    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix,
      hostname,
      pathname: '/refer',
    })
    referralProgramId = fixture.referralProgramId
    const link = await createUserReferralLink(user, {
      user_id: user.id,
      referral_program_id: referralProgramId!,
      url: `https://${hostname}/refer`,
    })
    linkId = link.id
  })
  it('deactivateUserReferralLink sets deactivated_at and clears activated_at', async () => {
    const deactivated = await deactivateUserReferralLink(user, linkId!)

    assert.ok(deactivated)
    assert.equal(deactivated.activated_at, null)
    assert.ok(deactivated.deactivated_at)
  })

  it('activateUserReferralLink sets activated_at and clears deactivated_at', async () => {
    await deactivateUserReferralLink(user, linkId!)

    const activated = await activateUserReferralLink(user, linkId!)

    assert.ok(activated)
    assert.ok(activated.activated_at)
    assert.equal(activated.deactivated_at, null)
  })

  it('activateUserReferralLink requires authentication', async () => {
    try {
      await activateUserReferralLink(null, linkId!)
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('deactivateUserReferralLink requires authentication', async () => {
    try {
      await deactivateUserReferralLink(null, linkId!)
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('activateUserReferralLink forbids activating a child referral link directly', async () => {
    const child = await createChildReferralLink(user.id, {
      userId: user.id,
      referralProgramId: referralProgramId!,
      url: `https://${hostname}/refer?test=activate-child`,
      parentLinkId: linkId!,
    })

    await assert.rejects(() => activateUserReferralLink(user, child.id), {
      status: 403,
      message: 'Child referral links are managed via their parent',
    })
  })

  it('deactivateUserReferralLink forbids deactivating a child referral link directly', async () => {
    const child = await createChildReferralLink(user.id, {
      userId: user.id,
      referralProgramId: referralProgramId!,
      url: `https://${hostname}/refer?test=deactivate-child`,
      parentLinkId: linkId!,
    })

    await assert.rejects(() => deactivateUserReferralLink(user, child.id), {
      status: 403,
      message: 'Child referral links are managed via their parent',
    })
  })
})
