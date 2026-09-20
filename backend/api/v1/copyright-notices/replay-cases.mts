import { expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  countTestCopyrightLifecycleEvents,
  readTestCopyrightActionIntentState,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { markTestMediaDeliveryRecordFailed } from '@voucha/test-helpers/entities/image-surface-placements'
import { getImagePlacementDeliveryKey } from '@services/images/delivery-registry'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
} from '@services/copyright-notices'

export async function verifyCopyrightActionReplayRoute(): Promise<true> {
  const fixture = await createCopyrightReplayFixture()
  await exhaustCopyrightActionIntent(fixture.intentId)
  const nonModeratorRequest = createRequest()
  await nonModeratorRequest.authenticateAs(fixture.nonModerator)
  await nonModeratorRequest
    .post(
      `/api/v1/copyright-notices/${fixture.noticeId}/action-intents/${fixture.intentId}/replays`,
    )
    .expect(403)
  const moderatorRequest = createRequest()
  await moderatorRequest.authenticateAs(fixture.moderator)
  const wrongScope = await moderatorRequest
    .post(
      `/api/v1/copyright-notices/${crypto.randomUUID()}/action-intents/${fixture.intentId}/replays`,
    )
    .expect(200)
  expect(wrongScope.body).toEqual({ replayed: false })
  expect(await readTestCopyrightActionIntentState(fixture.intentId)).toBe('failed')
  const replay = await moderatorRequest
    .post(
      `/api/v1/copyright-notices/${fixture.noticeId}/action-intents/${fixture.intentId}/replays`,
    )
    .expect(200)
  expect(replay.body).toEqual({ replayed: true })
  expect(await readTestCopyrightActionIntentState(fixture.intentId)).toBe('pending')
  await expectOneReplayAudit(fixture, 'copyright_action_replayed')
  expect(
    (
      await moderatorRequest
        .post(
          `/api/v1/copyright-notices/${fixture.noticeId}/action-intents/${fixture.intentId}/replays`,
        )
        .expect(200)
    ).body,
  ).toEqual({ replayed: false })
  await expectOneReplayAudit(fixture, 'copyright_action_replayed')
  return true
}

export async function verifyMediaDeliveryReplayRoute(): Promise<true> {
  const fixture = await createCopyrightReplayFixture()
  await expect(
    processCopyrightActionIntent(fixture.intentId, new Date('2026-07-01T12:01:00.000Z')),
  ).resolves.toBe('applied')
  const placement = await getTestPostImagePlacement(fixture.postId, fixture.imageId)
  if (!placement) throw new Error('copyright media delivery placement disappeared')
  await markTestMediaDeliveryRecordFailed(
    getImagePlacementDeliveryKey({
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId: fixture.imageId,
    }),
  )
  const nonModeratorRequest = createRequest()
  await nonModeratorRequest.authenticateAs(fixture.nonModerator)
  await nonModeratorRequest.post('/api/v1/copyright-media-delivery/replays').expect(403)
  const moderatorRequest = createRequest()
  await moderatorRequest.authenticateAs(fixture.moderator)
  const replay = await moderatorRequest.post('/api/v1/copyright-media-delivery/replays').expect(200)
  expect(replay.body.replayed).toBeGreaterThanOrEqual(1)
  await expectOneReplayAudit(fixture, 'media_delivery_registry_replayed')
  await moderatorRequest.post('/api/v1/copyright-media-delivery/replays').expect(200)
  await expectOneReplayAudit(fixture, 'media_delivery_registry_replayed')
  return true
}

async function createCopyrightReplayFixture() {
  const [claimant, moderator, nonModerator] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser(),
  ])
  const postId = await insertTestPost({
    title: `Copyright action replay ${crypto.randomUUID()}`,
    slug: `copyright-action-replay-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'Hosted image for a copyright action replay test.',
  })
  const imageId = await insertTestImage(claimant.id)
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

async function exhaustCopyrightActionIntent(intentId: string): Promise<void> {
  const startedAt = new Date('2026-07-01T12:01:00.000Z')
  const failedPublish = async () => Promise.reject(new Error('provider outage'))
  await expect(
    processCopyrightActionIntent(intentId, startedAt, {
      publishImagePlacementDeliveryRecord: failedPublish,
    }),
  ).rejects.toThrow('provider outage')
  await expect(
    processCopyrightActionIntent(intentId, new Date(startedAt.getTime() + 20 * 60_000), {
      publishImagePlacementDeliveryRecord: failedPublish,
    }),
  ).rejects.toThrow('provider outage')
  await expect(
    processCopyrightActionIntent(intentId, new Date(startedAt.getTime() + 40 * 60_000), {
      publishImagePlacementDeliveryRecord: failedPublish,
    }),
  ).rejects.toThrow('provider outage')
  await expect(
    processCopyrightActionIntent(intentId, new Date(startedAt.getTime() + 60 * 60_000), {
      publishImagePlacementDeliveryRecord: failedPublish,
    }),
  ).rejects.toThrow('provider outage')
  await expect(
    processCopyrightActionIntent(intentId, new Date(startedAt.getTime() + 80 * 60_000), {
      publishImagePlacementDeliveryRecord: failedPublish,
    }),
  ).resolves.toBe('blocked')
}

async function expectOneReplayAudit(
  fixture: Awaited<ReturnType<typeof createCopyrightReplayFixture>>,
  eventType: string,
): Promise<void> {
  expect(
    await countTestCopyrightLifecycleEvents({
      noticeId: fixture.noticeId,
      eventType,
      actorUserId: fixture.moderator.id,
    }),
  ).toBe(1)
}
