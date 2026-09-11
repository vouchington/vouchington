import { it, beforeAll, describe } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import assert from 'node:assert/strict'
import { createReferralProgramFixture, createTestUser } from '@voucha/test-helpers'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { createUserReferralLink } from './create.mts'
import { deactivateUserReferralLink } from './activate.mts'

describe('create', () => {
  let user: PrivateUser
  let referralProgramId: string | null = null
  let testHostname: string | null = null

  beforeAll(async () => {
    const testUser = await createTestUser()
    if (!testUser) throw new Error('Failed to create test user')
    user = testUser
    const randomSuffix = Math.random().toString(36).slice(7)
    testHostname = `create-test-${randomSuffix}.com`

    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/refer',
    })
    referralProgramId = fixture.referralProgramId
  })
  it('createUserReferralLink creates link with valid URL', async () => {
    const link = await createUserReferralLink(user, {
      user_id: user.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer`,
      label: 'My referral link',
    })
    assert.ok(link.id)
    assert.equal(link.user_id, user.id)
    assert.equal(link.referral_program_id, referralProgramId)
    assert.equal(link.label, 'My referral link')
    assert.ok(link.activated_at)
  })

  it('createUserReferralLink upserts duplicate links and reactivates deactivated rows', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)
    const url = `https://${testHostname}/refer?dedupe=${randomSuffix}`

    const first = await createUserReferralLink(user, {
      user_id: user.id,
      referral_program_id: referralProgramId!,
      url,
      label: 'Initial label',
    })
    await deactivateUserReferralLink(user, first.id)

    const second = await createUserReferralLink(user, {
      user_id: user.id,
      referral_program_id: referralProgramId!,
      url,
      label: 'Updated label',
    })

    assert.equal(second.id, first.id)
    assert.equal(second.label, 'Updated label')
    assert.ok(second.activated_at)
    assert.equal(second.deactivated_at, null)
  })

  it('createUserReferralLink fails with invalid URL', async () => {
    try {
      await createUserReferralLink(user, {
        user_id: user.id,
        referral_program_id: referralProgramId!,
        url: 'https://invalid.com/other',
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })

  it('createUserReferralLink requires authentication', async () => {
    try {
      await createUserReferralLink(null, {
        user_id: user.id,
        referral_program_id: referralProgramId!,
        url: 'https://example.com/refer',
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })

  it('createUserReferralLink rejects official accounts', async () => {
    const admin = await createTestUser({ administrator: true })

    await assert.rejects(
      () =>
        createUserReferralLink(admin, {
          user_id: admin.id,
          referral_program_id: referralProgramId!,
          url: `https://${testHostname}/refer?official=1`,
          label: 'Official link',
        }),
      {
        status: 403,
        code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
        message: 'Official accounts cannot publish personal referral-link endorsements.',
      },
    )
  })
})
