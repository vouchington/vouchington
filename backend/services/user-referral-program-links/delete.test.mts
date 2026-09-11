import { beforeAll, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { createReferralProgramFixture, createTestUser } from '@voucha/test-helpers'
import { createUserReferralLink } from './create.mts'
import { createChildReferralLink } from './create-child.mts'
import { deleteUserReferralLink } from './delete.mts'
import { getUserReferralLink } from './get.mts'

describe('delete', () => {
  let adminUser: Awaited<ReturnType<typeof createTestUser>> | null = null
  let regularUser: Awaited<ReturnType<typeof createTestUser>> | null = null
  let referralProgramId: string | null = null
  let testHostname: string | null = null

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const randomSuffix = Math.random().toString(36).slice(7)
    testHostname = `delete-test-${randomSuffix}.com`

    const fixture = await createReferralProgramFixture({
      createdById: adminUser!.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/refer',
    })
    referralProgramId = fixture.referralProgramId
  })

  it('deleteUserReferralLink soft deletes a link', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=delete1`,
      label: 'To be deleted',
    })
    await deleteUserReferralLink(regularUser, link.id)

    const deleted = await getUserReferralLink(link.id)
    assert.equal(deleted, null)
  })

  it('deleteUserReferralLink forbids non-admins from deleting other users links', async () => {
    const otherUser = await createTestUser()
    const link = await createUserReferralLink(otherUser, {
      user_id: otherUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=delete2`,
      label: 'Protected',
    })
    try {
      await deleteUserReferralLink(regularUser, link.id)
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 403)
    }
  })

  it('deleteUserReferralLink allows admins to delete any link', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=delete3`,
      label: 'Admin can delete',
    })
    await deleteUserReferralLink(adminUser, link.id)

    const deleted = await getUserReferralLink(link.id)
    assert.equal(deleted, null)
  })

  it('deleteUserReferralLink forbids deleting a child referral link directly', async () => {
    const parent = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=delete-child-parent`,
      label: 'Parent link',
    })
    const child = await createChildReferralLink(regularUser!.id, {
      userId: regularUser!.id,
      referralProgramId: referralProgramId!,
      url: `https://${testHostname}/refer?test=delete-child`,
      parentLinkId: parent.id,
    })

    await assert.rejects(() => deleteUserReferralLink(regularUser, child.id), {
      status: 403,
      message: 'Child referral links are managed via their parent',
    })
  })

  it('deleteUserReferralLink cascades to soft-delete children of the deleted parent', async () => {
    const parent = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=delete-cascade-parent`,
      label: 'Parent link',
    })
    const child = await createChildReferralLink(regularUser!.id, {
      userId: regularUser!.id,
      referralProgramId: referralProgramId!,
      url: `https://${testHostname}/refer?test=delete-cascade-child`,
      parentLinkId: parent.id,
    })

    await deleteUserReferralLink(regularUser, parent.id)

    const deletedParent = await getUserReferralLink(parent.id)
    const deletedChild = await getUserReferralLink(child.id)
    assert.equal(deletedParent, null)
    assert.equal(deletedChild, null)
  })

  it('deleteUserReferralLink requires authentication', async () => {
    const link = await createUserReferralLink(regularUser, {
      user_id: regularUser!.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=delete4`,
      label: 'Protected',
    })
    try {
      await deleteUserReferralLink(null, link.id)
      assert.fail('Should have thrown')
    } catch (error: unknown) {
      assert.ok(error && typeof error === 'object' && 'status' in error)
      assert.equal(error.status, 401)
    }
  })
})
