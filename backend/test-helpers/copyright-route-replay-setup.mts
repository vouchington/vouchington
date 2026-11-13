import { afterEach, beforeEach, vi } from 'vitest'
import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { mediaDeliveryEdgeEnvironment } from './media-delivery-emulator.mts'
import { markTestMediaDeliveryRecordFailed } from '@voucha/test-helpers/entities/image-surface-placements'
import { stageImagePlacementDeliveryRecord } from '../services/media-delivery-safety/index.mts'
import { prepublishCopyrightImagePlacementDenial } from '../services/copyright-notices/action-delivery-edge.mts'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

export async function createFailedMediaDeliveryReplayFixture() {
  const fixture = await createCopyrightReplayFixture()
  const mediaDeliveryRegistryRecordId = await failFixtureMediaDelivery(fixture)
  return { ...fixture, mediaDeliveryRegistryRecordId }
}

export async function failFixtureMediaDelivery(
  fixture: Awaited<ReturnType<typeof createCopyrightReplayFixture>>,
): Promise<string> {
  const placement = await applyCopyrightActionAndLoadPlacement(fixture)
  const staged = await stageImagePlacementDeliveryRecord({
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId: fixture.imageId,
    state: 'withheld',
  })
  await markTestMediaDeliveryRecordFailed(staged.mediaDeliveryRegistryRecordId)
  return staged.mediaDeliveryRegistryRecordId
}

export async function createCopyrightReplayFixture() {
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
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    moderatorId: moderator.id,
    revision: aggregate.targets[0]!.placement_revision,
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

/** Complete physical withholding is fixture authority, not another SERIALIZABLE actor under test. */
async function applyCopyrightActionAndLoadPlacement(
  fixture: Awaited<ReturnType<typeof createCopyrightReplayFixture>>,
) {
  const before = await getTestPostImagePlacement(fixture.postId, fixture.imageId)
  if (!before) throw new Error('copyright replay dependency placement disappeared')
  await prepublishCopyrightImagePlacementDenial({
    placementId: before.placement_id,
    revision: before.placement_revision,
    imageId: fixture.imageId,
  })
  await seedRestorationSceneWithhold(fixture.intentId)
  const placement = await getTestPostImagePlacement(fixture.postId, fixture.imageId)
  if (!placement) throw new Error('copyright media delivery placement disappeared')
  return placement
}

/** Publish to the AWS Emulator's media-delivery table and distribution; internal publication and database writes stay real. */
export function useTestMediaDeliveryReplayProviders(): void {
  beforeEach(async () => {
    for (const [name, value] of Object.entries(await mediaDeliveryEdgeEnvironment())) {
      vi.stubEnv(name, value)
    }
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
}

/** Settle every started fixture/read operation before preserving its original failure identity. */
export async function settleReplayFixtureOperations<T extends readonly unknown[]>(operations: {
  [K in keyof T]: Promise<T[K]>
}): Promise<T> {
  const results = await Promise.allSettled(operations)
  const failures: unknown[] = []
  for (const result of results) {
    if (
      result.status === 'rejected' &&
      !failures.some(reason => Object.is(reason, result.reason))
    ) {
      failures.push(result.reason)
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Replay fixture operations failed')
  return results.map(result => (result as PromiseFulfilledResult<unknown>).value) as unknown as T
}
