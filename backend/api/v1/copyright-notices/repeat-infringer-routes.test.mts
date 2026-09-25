import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
  getCopyrightRepeatInfringerAccount,
  listCopyrightRepeatInfringerAccountsForNotice,
} from '@services/copyright-notices'
import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('copyright repeat-infringer routes', () => {
  it('records staff dispositions and review outcomes over HTTP', async () => {
    const [poster, moderator, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const firstNoticeId = await confirmNotice(poster.id, moderator)
    await confirmNotice(poster.id, moderator)
    const accounts = await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    const incidentId = accounts[0]?.incident_id
    const reviewId = accounts[0]?.open_review_id
    if (!incidentId || !reviewId) throw new Error('route fixture disappeared')

    await createRequest()
      .get(`/api/v1/copyright-notices/${firstNoticeId}/repeat-infringer-accounts`)
      .expect(401)
    const staff = createRequest()
    await staff.authenticateAs(moderator)
    const listed = await staff
      .get(`/api/v1/copyright-notices/${firstNoticeId}/repeat-infringer-accounts`)
      .expect(200)
    expect(listed.body.copyright_repeat_infringer_accounts).toEqual([
      expect.objectContaining({ incident_id: incidentId, open_review_id: reviewId }),
    ])
    await staff
      .post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`)
      .set('Content-Type', 'text/plain')
      .send('nope')
      .expect(415)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`)
      .send({ disposition: 'duplicate' })
      .expect(422)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`)
      .send({ disposition: 'other', rationale: 'Not a disposition.' })
      .expect(422)
    const disposition = await staff
      .post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`)
      .send({ disposition: 'abusive', rationale: 'The notice was filed in bad faith.' })
      .expect(200)
    expect(disposition.body).toEqual({
      copyright_repeat_infringer_disposition: { incident_id: incidentId },
    })

    await staff
      .post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`)
      .send({ outcome: 'restrict', rationale: 'Moderators cannot suspend.' })
      .expect(403)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`)
      .send({ outcome: 'ban', rationale: 'Not an outcome.' })
      .expect(422)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`)
      .send({ outcome: 'warning' })
      .expect(422)
    const administrator = createRequest()
    await administrator.authenticateAs(admin)
    await administrator
      .post(`/api/v1/copyright-repeat-infringer-accounts/${poster.id}/reinstatements`)
      .send({ rationale: 'No termination is in effect.' })
      .expect(409)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-accounts/${poster.id}/reinstatements`)
      .send({})
      .expect(422)
    const warning = await staff
      .post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`)
      .send({ outcome: 'no_action', rationale: 'One incident no longer counts.' })
      .expect(200)
    expect(warning.body.copyright_repeat_infringer_review).toEqual(
      expect.objectContaining({ id: reviewId, outcome: 'no_action' }),
    )
    const after = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(after.open_review_id).toBeNull()
  })
})

async function confirmNotice(posterId: string, moderator: PrivateUser) {
  const postId = await insertTestPost({
    title: `repeat route ${crypto.randomUUID()}`,
    slug: `repeat-route-${crypto.randomUUID()}`,
    createdById: posterId,
    markdown: 'image',
  })
  const imageId = await insertTestImage(posterId)
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: null,
    claimantDisplayName: 'Claimant',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementKey: `image-placement:${placement.placement_id}`,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0].id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: null,
  })
  await completeCopyrightMandatoryHumanReview({
    noticeId: notice.id,
    restrictionId: restriction.id,
    currentUser: moderator,
    action: 'confirm',
    rationale: 'The restriction remains appropriate after review.',
    reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
  })
  return notice.id
}
