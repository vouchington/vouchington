import { createTestUser } from './entities/users.mts'
import { getTestPostImagePlacement } from './entities/post-images.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { createTestCopyrightDeliveryDependencies } from './copyright-delivery-dependencies.mts'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  processCopyrightActionIntent,
} from '../services/copyright-notices/index.mts'

/** Controlled clocks enter the real notice, assessment, restriction, and action service boundaries. */
export async function createTestTimedDsaReportAction(input: {
  receivedAt: Date
  imposedAt: Date
  completedAt: Date
}): Promise<string> {
  const [post, moderator] = await Promise.all([
    createHostedImagePost('public'),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const placement = await getTestPostImagePlacement(post.postId, post.imageId)
  if (!placement) throw new Error('Timed report target placement missing')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: input.receivedAt,
    claimantUserId: post.claimant.id,
    claimantDisplayName: null,
    claimantContactCiphertext: `claimant-${crypto.randomUUID()}`,
    workDescription: `Work ${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'staff',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId: post.imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/work/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  const submissionId = aggregate?.submissions[0]?.id
  const targetId = aggregate?.targets[0]?.id
  if (!submissionId || !targetId) throw new Error('Timed report case is incomplete')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId,
    assessedAt: new Date(input.imposedAt.getTime() - 1_000),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId,
    assessmentId: assessment.id,
    imposedAt: input.imposedAt,
    imposedById: moderator.id,
  })
  const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
  const withholdId = restricted?.actionIntents.find(intent => intent.action === 'withhold')?.id
  if (!withholdId) throw new Error('Timed report withhold intent missing')
  const dependencies = createTestCopyrightDeliveryDependencies(async () => undefined)
  const result = await processCopyrightActionIntent(withholdId, input.completedAt, dependencies)
  if (result !== 'applied') throw new Error(`Timed report action was ${result}`)
  return notice.id
}
