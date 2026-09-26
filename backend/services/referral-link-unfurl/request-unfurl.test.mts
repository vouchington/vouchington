import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  createReferralProgramFixture,
  createTestMembership,
  suspendTestUser,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { getPrivateUserByAny } from '@services/users/get'
import { getTopicBySlug } from '@services/topics/get'
import { addUserRole } from '@services/users/roles-permissions'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import { createChildReferralLink } from '@services/user-referral-program-links/create-child'
import { getUserReferralLink } from '@services/user-referral-program-links/get'
import { markReferralLinkUnfurlFailed } from '@services/user-referral-program-links/unfurl-state'
import { requestReferralLinkUnfurl } from './request-unfurl.mts'

// The Amex all-cards program is seeded via seed/referral-programs-topics.csv (slug
// `amex-referral-program`, hostname `*.americanexpress.com`, pathname
// `/en-us/referral/all-cards%`), not created as a per-test fixture -- it already exists in the
// shared test database, so test URLs must match its real seeded rule rather than a fixture one.
function buildAmexReferralUrl(suffix: string) {
  return `https://www.americanexpress.com/en-us/referral/all-cards?ref=${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe('requestReferralLinkUnfurl', () => {
  let owner: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let otherUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let adminUser: Awaited<ReturnType<typeof getPrivateUserByAny>> | null = null
  let referralProgramId: string | null = null

  beforeAll(async () => {
    owner = await createTestUserDirect()
    otherUser = await createTestUserDirect()
    const admin = await createTestUserDirect()
    await addUserRole(admin!.id, 'administrator')
    adminUser = await getPrivateUserByAny(admin!.id)

    const amexProgram = await getTopicBySlug('amex-referral-program')
    if (!amexProgram) throw new Error('Amex referral program seed topic not found')
    referralProgramId = amexProgram.id
  }, 30_000)

  async function createOwnerParentLink(labelSuffix: string) {
    const link = await createUserReferralLink(WEB_PROVENANCE, owner, {
      user_id: owner!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl(labelSuffix),
      label: `parent-${labelSuffix}`,
    })
    return link.id
  }

  it('throws 401 when currentUser is null', async () => {
    await expect(
      requestReferralLinkUnfurl(null, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({
      status: 401,
    })
  })

  it('throws for a suspended user', async () => {
    const user = await createTestUserDirect()
    await suspendTestUser(user!.id, 'test suspension')
    const suspended = await getPrivateUserByAny(user!.id)
    const linkId = await createOwnerParentLink('suspended-target')

    await expect(requestReferralLinkUnfurl(suspended, linkId)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('throws 422 for a malformed linkId', async () => {
    await expect(requestReferralLinkUnfurl(owner, 'not-a-uuid')).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 404 for a nonexistent linkId', async () => {
    await expect(
      requestReferralLinkUnfurl(owner, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404, message: 'Referral link not found' })
  })

  it('throws 422 when the link is not on the Amex all-cards referral program', async () => {
    const plusUser = await createTestUserDirect()
    await createTestMembership({ user_id: plusUser!.id, plan: 'plus' })
    const otherProgram = await createReferralProgramFixture({ createdById: plusUser!.id })
    const link = await createUserReferralLink(WEB_PROVENANCE, plusUser, {
      user_id: plusUser!.id,
      referral_program_id: otherProgram.referralProgramId,
      url: `https://${otherProgram.hostname}/ref/non-amex-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: 'non-amex link',
    })

    await expect(requestReferralLinkUnfurl(plusUser, link.id)).rejects.toMatchObject({
      status: 422,
      message: 'Only Amex all-cards referral links can be unfurled',
    })
  })

  it('throws 403 Forbidden for another user (non-owner, non-admin)', async () => {
    const linkId = await createOwnerParentLink('other-forbidden')

    await expect(requestReferralLinkUnfurl(otherUser, linkId)).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    })
  })

  it('throws 403 for a child referral link', async () => {
    const parentLinkId = await createOwnerParentLink('child-parent')
    const child = await createChildReferralLink(WEB_PROVENANCE, owner!.id, {
      userId: owner!.id,
      referralProgramId: referralProgramId!,
      url: buildAmexReferralUrl('child'),
      parentLinkId,
      label: 'Gold Card',
    })

    await expect(requestReferralLinkUnfurl(owner, child.id)).rejects.toMatchObject({
      status: 403,
      message: 'Child referral links are managed via their parent',
    })
  })

  it('throws 403 Premium membership required when the owner has no membership', async () => {
    const freeUser = await createTestUserDirect()
    const link = await createUserReferralLink(WEB_PROVENANCE, freeUser, {
      user_id: freeUser!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl('free'),
      label: 'free-tier link',
    })

    await expect(requestReferralLinkUnfurl(freeUser, link.id)).rejects.toMatchObject({
      status: 403,
      message: 'Premium membership required',
    })
  })

  it('succeeds for a plus-tier owner: marks the link requested and enqueues the unfurl job', async () => {
    const plusUser = await createTestUserDirect()
    await createTestMembership({ user_id: plusUser!.id, plan: 'plus' })
    const link = await createUserReferralLink(WEB_PROVENANCE, plusUser, {
      user_id: plusUser!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl('plus'),
      label: 'plus-tier link',
    })

    const updated = await requestReferralLinkUnfurl(plusUser, link.id)

    expect(updated.id).toBe(link.id)
    expect(updated.unfurl_requested_at).toBeTruthy()

    const stored = await getUserReferralLink(link.id)
    expect(stored?.unfurl_requested_at).toBeTruthy()
  })

  it('succeeds for a pro-tier owner', async () => {
    const proUser = await createTestUserDirect()
    await createTestMembership({ user_id: proUser!.id, plan: 'pro' })
    const link = await createUserReferralLink(WEB_PROVENANCE, proUser, {
      user_id: proUser!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl('pro'),
      label: 'pro-tier link',
    })

    const updated = await requestReferralLinkUnfurl(proUser, link.id)

    expect(updated.unfurl_requested_at).toBeTruthy()
  })

  it('allows an admin to request unfurl on behalf of a plus-tier owner', async () => {
    const plusUser = await createTestUserDirect()
    await createTestMembership({ user_id: plusUser!.id, plan: 'plus' })
    const link = await createUserReferralLink(WEB_PROVENANCE, plusUser, {
      user_id: plusUser!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl('admin-plus'),
      label: 'admin-managed plus link',
    })

    const updated = await requestReferralLinkUnfurl(adminUser, link.id)

    expect(updated.unfurl_requested_at).toBeTruthy()
  })

  it('rejects an admin requesting unfurl on behalf of a free-tier owner (paid gate is on the owner)', async () => {
    const freeUser = await createTestUserDirect()
    const link = await createUserReferralLink(WEB_PROVENANCE, freeUser, {
      user_id: freeUser!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl('admin-free'),
      label: 'admin-managed free link',
    })

    await expect(requestReferralLinkUnfurl(adminUser, link.id)).rejects.toMatchObject({
      status: 403,
      message: 'Premium membership required',
    })
  })

  it('re-requesting a previously-failed unfurl clears unfurl_failed_at and unfurl_last_error', async () => {
    const plusUser = await createTestUserDirect()
    await createTestMembership({ user_id: plusUser!.id, plan: 'plus' })
    const link = await createUserReferralLink(WEB_PROVENANCE, plusUser, {
      user_id: plusUser!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl('retry'),
      label: 'retry link',
    })

    await requestReferralLinkUnfurl(plusUser, link.id)
    await markReferralLinkUnfurlFailed(link.id, 'crawl timed out')

    const failed = await getUserReferralLink(link.id)
    expect(failed?.unfurl_failed_at).toBeTruthy()
    expect(failed?.unfurl_last_error).toBe('crawl timed out')

    const retried = await requestReferralLinkUnfurl(plusUser, link.id)

    expect(retried.unfurl_failed_at).toBeNull()
    expect(retried.unfurl_last_error).toBeNull()
    expect(retried.unfurl_requested_at).toBeTruthy()
  })
})
