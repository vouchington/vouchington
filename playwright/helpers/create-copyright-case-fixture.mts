import { createTestUser } from '../../backend/test-helpers/entities/users.mts'
import { insertTestPost } from '../../backend/test-helpers/entities/posts.mts'
import { insertTestImage } from '../../backend/test-helpers/entities/images-insert.mts'
import { insertTestPostImage } from '../../backend/test-helpers/entities/images.mts'
import { createCopyrightFormIntake } from '../../backend/services/copyright-notices/form-intakes.mts'
import { appendCopyrightSubmissionAssessment } from '../../backend/services/copyright-notices/index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../../backend/services/copyright-notices/restrictions.mts'
import { requireTestValue } from './assertions.mts'
import { randomSuffix } from './random-id.mts'
import { getCopyrightNoticePrivateAggregate } from '../../backend/test-helpers/services/copyright-notices/private-aggregate.mts'

export async function createCopyrightCaseFixture() {
  const suffix = randomSuffix()
  const poster = requireTestValue(await createTestUser(), 'Copyright poster missing')
  const claimant = requireTestValue(await createTestUser(), 'Copyright claimant missing')
  const moderator = requireTestValue(
    await createTestUser({ administrator: true }),
    'Copyright reviewer missing',
  )
  const postId = await insertTestPost({
    title: `Copyright material ${suffix}`,
    slug: `copyright-material-${suffix}`,
    createdById: poster.id,
    markdown: 'Owned hosted image.',
  })
  const imageId = await insertTestImage(poster.id)
  await insertTestPostImage({ postId, imageId })
  const hostedUseUrl = `https://voucha.ai/discussion/${postId}`
  const { intake } = await createCopyrightFormIntake({
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: `Claimant ${suffix}`,
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: `Owned photograph ${suffix}`,
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: `Claimant ${suffix}`,
      claimantTargets: [{ postId, imageId, hostedUseUrl }],
    },
  })
  const aggregate = requireTestValue(
    await getCopyrightNoticePrivateAggregate(intake.copyright_notice_id),
    'Copyright aggregate missing',
  )
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const target = requireTestValue(aggregate.targets[0], 'Copyright target missing')
  await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: intake.copyright_notice_id,
    targetId: target.id,
    assessmentId: assessment.id,
    imposedAt: new Date(),
    imposedById: null,
  })
  return {
    poster,
    moderator,
    noticeId: intake.copyright_notice_id,
    targetId: target.id,
    hostedUseUrl,
  }
}
