import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { markTestMediaDeliveryRecordFailed } from '@voucha/test-helpers/entities/image-surface-placements'
import { getImagePlacementDeliveryKey } from '../services/media-delivery-safety/delivery-registry-types.mts'
import { processCopyrightActionIntent } from '../services/copyright-notices/index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

export async function createFailedMediaDeliveryReplayFixture() {
  const fixture = await createCopyrightReplayFixture()
  const deliveryKey = await failFixtureMediaDelivery(fixture)
  return { ...fixture, deliveryKey }
}

async function failFixtureMediaDelivery(
  fixture: Awaited<ReturnType<typeof createCopyrightReplayFixture>>,
): Promise<string> {
  const placement = await applyCopyrightActionAndLoadPlacement(fixture)
  const deliveryKey = getImagePlacementDeliveryKey({
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId: fixture.imageId,
  })
  await markTestMediaDeliveryRecordFailed(deliveryKey)
  return deliveryKey
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
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
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
  return {
    claimant,
    intentId: intent.id,
    imageId,
    moderator,
    nonModerator,
    noticeId: notice.id,
    postId,
  }
}

async function applyCopyrightActionAndLoadPlacement(
  fixture: Awaited<ReturnType<typeof createCopyrightReplayFixture>>,
) {
  await processCopyrightActionIntent(fixture.intentId, new Date())
  const placement = await getTestPostImagePlacement(fixture.postId, fixture.imageId)
  if (!placement) throw new Error('copyright media delivery placement disappeared')
  return placement
}
