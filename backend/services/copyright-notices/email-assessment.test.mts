import { commitCopyrightWritersInOrder } from '@voucha/test-helpers/copyright-form-review-assessment-race'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { seedCopyrightSubmissionAssessment } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  copyrightRaceResult,
  assessmentSerializationConflict,
  readCopyrightAssessmentRaceState,
} from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import { getOrCreateEmailAssessment } from './email-assessment.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

async function createScene() {
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
  return { moderator, notice, submissionId }
}

describe('getOrCreateEmailAssessment', () => {
  it('commits at most one complete concurrent assessment without choosing a winner', async () => {
    const { moderator, notice, submissionId } = await createScene()
    const before = await readCopyrightAssessmentRaceState(notice.id)
    const assess = () =>
      getOrCreateEmailAssessment(moderator, { noticeId: notice.id, submissionId })
    const results = await commitCopyrightWritersInOrder(
      assess,
      assess,
      'appendCopyrightSubmissionAssessment:event',
      'appendCopyrightSubmissionAssessment:lockSubmission',
      submissionId,
      [notice.id, submissionId],
    )
    const after = await readCopyrightAssessmentRaceState(notice.id)
    const id = after.assessments[0]?.id
    const committed = {
      ...before,
      assessments: [{ id, supersedes: null, compliant: true }],
      identities: [id],
      pointers: [{ id: submissionId, assessment: id, compliant: true }],
      events: [...before.events, 'submission_assessed'].toSorted(),
    }
    // Either SERIALIZABLE writer can lose, including both losing to unrelated owned writers.
    expect([
      { results: [{ status: 'fulfilled', id }, assessmentSerializationConflict], state: committed },
      { results: [assessmentSerializationConflict, { status: 'fulfilled', id }], state: committed },
      {
        results: [assessmentSerializationConflict, assessmentSerializationConflict],
        state: before,
      },
    ]).toContainEqual({ results: results.map(copyrightRaceResult), state: after })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    const expectedEvents = id ? [{ actor: moderator.id, assessment: id }] : []
    expect(
      aggregate?.lifecycleEvents
        .filter(row => row.change_type === 'submission_assessed')
        .map(row => ({
          actor: row.changed_by_id,
          assessment: row.copyright_notice_submission_assessment_identity_id,
        })),
    ).toEqual(expectedEvents)
  })

  it('reuses a committed compliant assessment on a nonwriting replay', async () => {
    const { moderator, notice, submissionId } = await createScene()
    const assessment = await seedCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
    })
    const before = await getCopyrightNoticePrivateAggregate(notice.id)
    await expect(
      getOrCreateEmailAssessment(moderator, { noticeId: notice.id, submissionId }),
    ).resolves.toEqual({ id: assessment.id })
    expect(await getCopyrightNoticePrivateAggregate(notice.id)).toEqual(before)
  })

  it('fails closed when a committed non-compliant assessment blocks a compliant create', async () => {
    const { moderator, notice, submissionId } = await createScene()
    await seedCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: false,
    })
    const before = await getCopyrightNoticePrivateAggregate(notice.id)
    await expect(
      getOrCreateEmailAssessment(moderator, { noticeId: notice.id, submissionId }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Copyright email assessment conflicted without a current result',
    })
    expect(await getCopyrightNoticePrivateAggregate(notice.id)).toEqual(before)
  })
})
