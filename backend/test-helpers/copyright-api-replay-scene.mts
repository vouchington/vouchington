import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from './index.mts'
import { settleReplayFixtureOperations } from './copyright-route-replay-setup.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { stageImagePlacementDeliveryRecord } from '../services/media-delivery-safety/index.mts'
import { markTestMediaDeliveryRecordFailed } from './entities/image-surface-placements.mts'

/** Complete committed human authority for replay/timeline subjects, without incidental SERIAL writes. */
export async function createCommittedCopyrightReplayFixture() {
  const [claimant, moderator, nonModerator] = await settleReplayFixtureOperations([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser(),
  ])
  const [postId, imageId] = await settleReplayFixtureOperations([
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
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'notice' },
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
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: new Date('2026-07-01T11:30:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  await seedCopyrightStatementRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0]!.id,
    assessmentId: assessment.id,
    revision: aggregate.targets[0]!.placement_revision,
    moderatorId: moderator.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
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
    placementId: placement.placement_id,
  }
}

/** A fully delivered owned withhold followed by a failed registry record is the replay prerequisite. */
export async function createCommittedFailedMediaReplayFixture() {
  const fixture = await createCommittedCopyrightReplayFixture()
  await seedRestorationSceneWithhold(fixture.intentId)
  const placement = await getTestPostImagePlacement(fixture.postId, fixture.imageId)
  if (!placement) throw new Error('Committed replay placement missing')
  const staged = await stageImagePlacementDeliveryRecord({
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId: fixture.imageId,
    state: 'withheld',
  })
  await markTestMediaDeliveryRecordFailed(staged.mediaDeliveryRegistryRecordId)
  return { ...fixture, mediaDeliveryRegistryRecordId: staged.mediaDeliveryRegistryRecordId }
}
