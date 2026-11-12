import { commitCopyrightWritersInOrder } from '@voucha/test-helpers/copyright-form-review-assessment-race'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { getOrCreateEmailAssessment } from './email-assessment.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('getOrCreateEmailAssessment', () => {
  it('commits one concurrent assessment and reuses its result on a later nonwriting replay', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const poster = await createTestUser()
    const postId = await insertTestPost({
      title: `email assessment ${crypto.randomUUID()}`,
      slug: `email-assessment-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    const placementId = await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: null,
      claimantDisplayName: 'Claimant',
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: 'Original photograph',
      policyVersion: 'test-v1',
      initialSubmission: { kind: 'notice', sourceKind: 'email', bodyCiphertext: 'ciphertext' },
      targets: [
        {
          placementId,
          placementRevision: 1,
          imageId,
          bindingFamily: 'post',
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const submissionId = aggregate?.submissions[0]?.id
    if (!submissionId) throw new Error('email submission missing')
    const assess = () =>
      getOrCreateEmailAssessment(moderator, { noticeId: notice.id, submissionId })
    const [first, second] = await commitCopyrightWritersInOrder(
      assess,
      assess,
      'appendCopyrightSubmissionAssessment:event',
      'appendCopyrightSubmissionAssessment:lockSubmission',
      submissionId,
      [notice.id, submissionId],
    )
    const after = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(after?.assessments).toHaveLength(1)
    const assessmentId = after!.assessments[0]!.id
    expect(first).toMatchObject({ status: 'fulfilled', value: { id: assessmentId } })
    expect(second).toMatchObject({
      status: 'rejected',
      reason: { status: 409, code: 'CONFLICT', cause: { code: '40001' } },
    })
    expect(after?.submissions[0]).toMatchObject({ current_assessment_identity_id: assessmentId })
    expect(
      after?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
    ).toEqual([expect.objectContaining({ changed_by_id: moderator.id })])
    await expect(assess()).resolves.toEqual({ id: assessmentId })
    expect(await getCopyrightNoticePrivateAggregate(notice.id)).toEqual(after)
  })

  it('fails closed when a non-compliant current assessment blocks a compliant create', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const poster = await createTestUser()
    const postId = await insertTestPost({
      title: `email assessment conflict ${crypto.randomUUID()}`,
      slug: `email-assessment-conflict-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    const placementId = await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: null,
      claimantDisplayName: 'Claimant',
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: 'Original photograph',
      policyVersion: 'test-v1',
      initialSubmission: { kind: 'notice', sourceKind: 'email', bodyCiphertext: 'ciphertext' },
      targets: [
        {
          placementId,
          placementRevision: 1,
          imageId,
          bindingFamily: 'post',
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const submissionId = aggregate?.submissions[0]?.id
    if (!submissionId) throw new Error('email submission missing')
    const compliant = await appendCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
    })
    await appendCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: compliant.id,
    })
    await expect(
      getOrCreateEmailAssessment(moderator, { noticeId: notice.id, submissionId }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
