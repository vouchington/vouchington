import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect, createTestMembership, WEB_PROVENANCE } from '@voucha/test-helpers'
import { getTopicBySlug } from '@services/topics/get'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import { createChildReferralLink } from '@services/user-referral-program-links/create-child'

// The Amex all-cards program is seeded via seed/referral-programs-topics.csv (slug
// `amex-referral-program`, hostname `*.americanexpress.com`, pathname
// `/en-us/referral/all-cards%`), not created as a per-test fixture -- only a link on that program
// clears requestReferralLinkUnfurl's Amex-only gate, so test URLs must match its real seeded rule.
function buildAmexReferralUrl(suffix: string) {
  return `https://www.americanexpress.com/en-us/referral/all-cards?ref=${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe('unfurls', () => {
  let owner: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let otherUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let referralProgramId: string | null = null

  beforeAll(async () => {
    owner = await createTestUserDirect()
    otherUser = await createTestUserDirect()

    const amexProgram = await getTopicBySlug('amex-referral-program')
    if (!amexProgram) throw new Error('Amex referral program seed topic not found')
    referralProgramId = amexProgram.id
  }, 30_000)

  async function createOwnerParentLink(labelSuffix: string) {
    const link = await createUserReferralLink(WEB_PROVENANCE, owner, {
      user_id: owner!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl(labelSuffix),
      label: `api-parent-${labelSuffix}`,
    })
    return link.id
  }

  it('POST /api/v1/referral-links/:linkId/unfurls requires auth', async () => {
    const request = createRequest()
    const linkId = await createOwnerParentLink('unauth')

    await request.post(`/api/v1/referral-links/${linkId}/unfurls`).expect(401)
  })

  it('returns 404 for a nonexistent linkId', async () => {
    const request = createRequest()
    await request.authenticateAs(owner!)

    await request
      .post('/api/v1/referral-links/00000000-0000-0000-0000-000000000000/unfurls')
      .expect(404)
  })

  it('returns 403 for another user (non-owner)', async () => {
    const request = createRequest()
    await request.authenticateAs(otherUser!)
    const linkId = await createOwnerParentLink('other-forbidden')

    await request.post(`/api/v1/referral-links/${linkId}/unfurls`).expect(403)
  })

  it('returns 403 for a child referral link', async () => {
    const request = createRequest()
    await request.authenticateAs(owner!)
    const parentLinkId = await createOwnerParentLink('child-parent')
    const child = await createChildReferralLink(WEB_PROVENANCE, owner!.id, {
      userId: owner!.id,
      referralProgramId: referralProgramId!,
      url: buildAmexReferralUrl('api-child'),
      parentLinkId,
      label: 'Gold Card',
    })

    await request.post(`/api/v1/referral-links/${child.id}/unfurls`).expect(403)
  })

  it('returns 403 for a free-tier owner', async () => {
    const request = createRequest()
    await request.authenticateAs(owner!)
    const linkId = await createOwnerParentLink('free-tier')

    await request.post(`/api/v1/referral-links/${linkId}/unfurls`).expect(403)
  })

  it('returns 202 for a plus-tier owner requesting unfurl on their own link', async () => {
    const plusUser = await createTestUserDirect()
    await createTestMembership({ user_id: plusUser!.id, plan: 'plus' })
    const link = await createUserReferralLink(WEB_PROVENANCE, plusUser, {
      user_id: plusUser!.id,
      referral_program_id: referralProgramId!,
      url: buildAmexReferralUrl('api-plus'),
      label: 'api plus-tier link',
    })

    const request = createRequest()
    await request.authenticateAs(plusUser!)

    const res = await request.post(`/api/v1/referral-links/${link.id}/unfurls`).expect(202)

    expect(res.body.referral_link.id).toBe(link.id)
    expect(res.body.referral_link.unfurl_requested_at).toBeTruthy()
  })
})
