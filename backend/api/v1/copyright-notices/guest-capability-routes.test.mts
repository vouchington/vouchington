import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  readTestInformationRequestIntents,
  recordTestClaimantEmailReceipt,
} from '@voucha/test-helpers/services/copyright-notices/claimant-delivery'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'

const dayMs = 24 * 60 * 60 * 1000

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * dayMs).toISOString()
}

async function openNotice() {
  const owner = await createTestUser()
  const imageId = await insertTestImage(owner.id)
  const postId = await insertTestPost({
    title: `guest route ${crypto.randomUUID()}`,
    slug: `guest-route-${crypto.randomUUID()}`,
    createdById: owner.id,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-07-01T12:00:00.000Z'),
    claimantUserId: null,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'guest_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return notice.id
}

describe('copyright guest capability routes', () => {
  it('issues, files, and revokes a case capability without returning the statement', async () => {
    const noticeId = await openNotice()
    const claimantEmail = await recordTestClaimantEmailReceipt(noticeId)
    const [moderator, outsider] = await Promise.all([
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
    ])
    const guest = createRequest()
    await guest
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: daysFromNow(7) })
      .expect(401)
    const member = createRequest()
    await member.authenticateAs(outsider)
    await member
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: daysFromNow(7) })
      .expect(403)
    await member.get(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`).expect(403)
    const staff = createRequest()
    await staff.authenticateAs(moderator)
    await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: '2020-01-01T00:00:00.000Z' })
      .expect(422)
    await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: daysFromNow(31) })
      .expect(422)
    const expiresAt = daysFromNow(7)
    const issued = await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: expiresAt })
      .expect(201)
    const capability = issued.body.copyright_guest_capability
    expect(capability.token).toEqual(expect.any(String))
    expect(capability.id).toEqual(expect.any(String))
    const listed = await staff
      .get(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .expect(200)
    expect(listed.headers['cache-control']).toBe('private, no-store')
    expect(listed.body).toEqual({
      copyright_guest_capabilities: [
        {
          id: capability.id,
          issued_at: expect.any(String),
          issued_by_id: moderator.id,
          issued_by_username: moderator.username,
          expires_at: expiresAt,
          revoked_at: null,
        },
      ],
      page_info: expect.objectContaining({ has_next_page: false }),
    })
    expect(JSON.stringify(listed.body)).not.toContain(capability.token)
    const statement = 'This filing corrects the work description.'
    await guest
      .post(`/api/v1/copyright-notices/${noticeId}/guest-filings`)
      .send({ kind: 'supplement', statement })
      .expect(403)
    await guest
      .post(`/api/v1/copyright-notices/${noticeId}/guest-filings`)
      .set('Copyright-Guest-Capability', capability.token)
      .send({ kind: 'poem', statement })
      .expect(422)
    const filed = await guest
      .post(`/api/v1/copyright-notices/${noticeId}/guest-filings`)
      .set('Copyright-Guest-Capability', capability.token)
      .send({ kind: 'supplement', statement })
      .expect(201)
    expect(filed.body).toEqual({
      copyright_submission: {
        id: expect.any(String),
        kind: 'supplement',
        received_at: expect.any(String),
      },
    })
    expect(JSON.stringify(filed.body)).not.toContain(statement)
    const requested = await staff
      .post(
        `/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capability.id}/information-requests`,
      )
      .send({ statement: 'Send the registration number.' })
      .expect(201)
    expect(requested.body.copyright_correspondence.id).toEqual(expect.any(String))
    await expect(readTestInformationRequestIntents(noticeId)).resolves.toEqual([
      expect.objectContaining({
        correspondenceId: requested.body.copyright_correspondence.id,
        recipientEmail: claimantEmail,
        state: 'pending',
      }),
    ])
    const revoked = await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capability.id}/revocation`)
      .expect(200)
    expect(revoked.body.copyright_guest_capability).toEqual({
      id: capability.id,
      revoked_at: expect.any(String),
    })
    const relisted = await staff
      .get(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .expect(200)
    expect(relisted.body.copyright_guest_capabilities[0].revoked_at).toBe(
      revoked.body.copyright_guest_capability.revoked_at,
    )
    await guest
      .post(`/api/v1/copyright-notices/${noticeId}/guest-filings`)
      .set('Copyright-Guest-Capability', capability.token)
      .send({ kind: 'withdrawal', statement: 'Withdraw the claim.' })
      .expect(403)
  })
})
