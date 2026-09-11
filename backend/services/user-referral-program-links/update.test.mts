import { beforeAll, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { createReferralProgramFixture, createTestUser } from '@voucha/test-helpers'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { createUserReferralLink } from './create.mts'
import { createChildReferralLink } from './create-child.mts'
import { updateUserReferralLink } from './update.mts'

describe('update', () => {
  let adminUser: Awaited<ReturnType<typeof createTestUser>> | null = null
  let regularUser: Awaited<ReturnType<typeof createTestUser>> | null = null
  let referralProgramId: string | null = null
  let testHostname: string | null = null

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const randomSuffix = Math.random().toString(36).slice(7)
    testHostname = `update-test-${randomSuffix}.com`

    const fixture = await createReferralProgramFixture({
      createdById: adminUser!.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/refer',
    })
    referralProgramId = fixture.referralProgramId
  })

  it('updateUserReferralLink updates label', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update1`,
      label: 'Initial label',
    })
    const updated = await updateUserReferralLink(regularUser, link.id, {
      label: '  Updated label  ',
    })

    assert.ok(updated)
    assert.equal(updated.label, 'Updated label')
    assert.equal(updated.id, link.id)
  })

  it('updateUserReferralLink trims and validates label length', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update2`,
      label: 'Initial',
    })
    const longLabel = 'a'.repeat(256)
    try {
      await updateUserReferralLink(regularUser, link.id, {
        label: longLabel,
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })

  it('updateUserReferralLink validates label type', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update3`,
      label: 'Initial',
    })
    try {
      await updateUserReferralLink(regularUser, link.id, {
        label: 123 as unknown as string,
      })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 422)
    }
  })

  it('updateUserReferralLink returns unchanged link when label is undefined', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update4`,
      label: 'Original label',
    })
    const result = await updateUserReferralLink(regularUser, link.id, {})

    assert.ok(result)
    assert.equal(result.id, link.id)
    assert.equal(result.label, 'Original label')
  })

  it('updateUserReferralLink sets label to null when empty string', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update5`,
      label: 'Original',
    })
    const updated = await updateUserReferralLink(regularUser, link.id, {
      label: '   ',
    })

    assert.ok(updated)
    assert.equal(updated.label, null)
  })

  it('updateUserReferralLink forbids non-admins from updating other users links', async () => {
    const otherUser = await createTestUser()
    const link = await createUserReferralLink(otherUser, {
      user_id: otherUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update6`,
      label: 'Original',
    })
    try {
      await updateUserReferralLink(regularUser, link.id, { label: 'Hacked' })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 403)
    }
  })

  it('updateUserReferralLink rejects official accounts', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update7`,
      label: 'Original',
    })

    await assert.rejects(
      () =>
        updateUserReferralLink(adminUser, link.id, {
          label: 'Admin updated',
        }),
      {
        status: 403,
        code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
        message: 'Official accounts cannot edit personal referral-link endorsements.',
      },
    )
  })

  it('updateUserReferralLink forbids editing a child referral link', async () => {
    const parent = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update-child-parent`,
      label: 'Parent link',
    })
    const child = await createChildReferralLink(regularUser!.id, {
      userId: regularUser!.id,
      referralProgramId: referralProgramId!,
      url: `https://${testHostname}/refer?test=update-child`,
      parentLinkId: parent.id,
    })

    await assert.rejects(() => updateUserReferralLink(regularUser, child.id, { label: 'Hacked' }), {
      status: 403,
      message: 'Child referral links are managed via their parent',
    })
  })

  it('updateUserReferralLink requires authentication', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=update8`,
      label: 'Protected',
    })
    try {
      await updateUserReferralLink(null, link.id, { label: 'Hacked' })
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })
})
