import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createCopyrightNoticeAggregate } from '@services/copyright-notices'
import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'

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
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return notice.id
}

describe('copyright guest capability routes', () => {
  it('issues, files, and revokes a case capability without returning the statement', async () => {
    const noticeId = await openNotice()
    const [moderator, outsider] = await Promise.all([
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
    ])
    const guest = createRequest()
    await guest
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: '2026-07-03T12:00:00.000Z' })
      .expect(401)
    const member = createRequest()
    await member.authenticateAs(outsider)
    await member
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: '2026-07-03T12:00:00.000Z' })
      .expect(403)
    const staff = createRequest()
    await staff.authenticateAs(moderator)
    await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: '2020-01-01T00:00:00.000Z' })
      .expect(422)
    const issued = await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities`)
      .send({ expires_at: '2099-07-03T12:00:00.000Z' })
      .expect(201)
    const capability = issued.body.copyright_guest_capability
    expect(capability.token).toEqual(expect.any(String))
    expect(capability.id).toEqual(expect.any(String))
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
    const revoked = await staff
      .post(`/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capability.id}/revocation`)
      .expect(200)
    expect(revoked.body.copyright_guest_capability).toEqual({
      id: capability.id,
      revoked_at: expect.any(String),
    })
    await guest
      .post(`/api/v1/copyright-notices/${noticeId}/guest-filings`)
      .set('Copyright-Guest-Capability', capability.token)
      .send({ kind: 'withdrawal', statement: 'Withdraw the claim.' })
      .expect(403)
  })
})
