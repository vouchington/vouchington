// Route replay assertions are service-owned test support, not route registration.
import { expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  countTestCopyrightLifecycleEvents,
  readTestCopyrightActionIntentState,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { processCopyrightActionIntent } from '@services/copyright-notices'
import {
  createCopyrightReplayFixture,
  createFailedMediaDeliveryReplayFixture,
} from './route-replay-fixture-setup.mts'

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
  const fixture = await createFailedMediaDeliveryReplayFixture()
  const nonModeratorRequest = createRequest()
  await nonModeratorRequest.authenticateAs(fixture.nonModerator)
  await nonModeratorRequest.post('/api/v1/copyright-media-delivery/replays').expect(403)
  const moderatorRequest = createRequest()
  await moderatorRequest.authenticateAs(fixture.moderator)
  const replay = await moderatorRequest.post('/api/v1/copyright-media-delivery/replays').expect(200)
  expect(replay.body.replayed).toBeGreaterThanOrEqual(1)
  await replayMediaDeliveryAndAssertAudit(moderatorRequest, fixture)
  await replayMediaDeliveryAndAssertAudit(moderatorRequest, fixture)
  return true
}

async function exhaustCopyrightActionIntent(intentId: string): Promise<void> {
  const startedAt = new Date('2026-07-01T12:01:00.000Z')
  const failedPublish = async () => Promise.reject(new Error('provider outage'))
  await expectCopyrightActionDeliveryFailures(intentId, startedAt, failedPublish, [0, 20, 40, 60])
  await expect(
    processCopyrightActionIntent(intentId, new Date(startedAt.getTime() + 80 * 60_000), {
      publishImagePlacementDeliveryRecord: failedPublish,
    }),
  ).resolves.toBe('blocked')
}

async function expectCopyrightActionDeliveryFailures(
  intentId: string,
  startedAt: Date,
  failedPublish: () => Promise<never>,
  offsets: number[],
): Promise<void> {
  const [offsetMinutes, ...remainingOffsets] = offsets
  if (offsetMinutes === undefined) return
  await expect(
    processCopyrightActionIntent(intentId, new Date(startedAt.getTime() + offsetMinutes * 60_000), {
      publishImagePlacementDeliveryRecord: failedPublish,
    }),
  ).rejects.toThrow('provider outage')
  await expectCopyrightActionDeliveryFailures(intentId, startedAt, failedPublish, remainingOffsets)
}

async function replayMediaDeliveryAndAssertAudit(
  moderatorRequest: ReturnType<typeof createRequest>,
  fixture: Awaited<ReturnType<typeof createCopyrightReplayFixture>>,
): Promise<void> {
  await moderatorRequest.post('/api/v1/copyright-media-delivery/replays').expect(200)
  await expectOneReplayAudit(fixture, 'media_delivery_registry_replayed')
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
