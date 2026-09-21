import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { markTestMediaDeliveryRecordFailed } from '@voucha/test-helpers/entities/image-surface-placements'
import { getImagePlacementDeliveryKey } from '@services/media-delivery-safety'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
} from '@services/copyright-notices'

export async function createFailedMediaDeliveryReplayFixture() {
  const fixture = await createCopyrightReplayFixture()
  await failFixtureMediaDelivery(fixture)
  return fixture
}

async function failFixtureMediaDelivery(
  fixture: Awaited<ReturnType<typeof createCopyrightReplayFixture>>,
): Promise<void> {
  const placement = await applyCopyrightActionAndLoadPlacement(fixture)
  await markTestMediaDeliveryRecordFailed(
    getImagePlacementDeliveryKey({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId: fixture.imageId,
    }),
  )
}

export async function createCopyrightReplayFixture() {
  const [claimant, moderator, nonModerator] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser(),
  ])
  const [postId, imageId] = await Promise.all([
    insertTestPost({
      title: `Copyright action replay ${crypto.randomUUID()}`,
      slug: `copyright-action-replay-${crypto.randomUUID()}`,
      createdById: claimant.id,
      markdown: 'Hosted image for a copyright action replay test.',
    }),
    insertTestImage(claimant.id),
  ])
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('copyright action replay placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-07-01T11:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: 'Test claimant',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'staff', bodyCiphertext: 'notice' },
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
  if (!aggregate) throw new Error('copyright action replay notice disappeared')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: new Date('2026-07-01T11:30:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0]!.id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: moderator.id,
  })
  const intent = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
    item => item.action === 'withhold',
  )
  if (!intent) throw new Error('copyright action replay intent disappeared')
  return { intentId: intent.id, imageId, moderator, nonModerator, noticeId: notice.id, postId }
}

async function applyCopyrightActionAndLoadPlacement(
  fixture: Awaited<ReturnType<typeof createCopyrightReplayFixture>>,
) {
  await processCopyrightActionIntent(fixture.intentId, new Date('2026-07-01T12:01:00.000Z'))
  const placement = await getTestPostImagePlacement(fixture.postId, fixture.imageId)
  if (!placement) throw new Error('copyright media delivery placement disappeared')
  return placement
}
