import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
// Route replay assertions are service-owned test support, not route registration.
import { expect, onTestFinished, vi } from 'vitest'
import * as mediaReplayEnqueues from '@queues/notifications/enqueues/media-delivery-registry'
import { notifications } from '@queues/notifications/queues'
import { readEnqueuedJob } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  countTestCopyrightLifecycleEvents,
  readTestCopyrightActionIntentState,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { processCopyrightActionIntent } from '../services/copyright-notices/index.mts'
import { replayFailedMediaDeliveryRegistryRecords } from '../services/media-delivery-safety/index.mts'
import {
  settleReplayFixtureOperations,
  createCopyrightReplayFixture,
  createFailedMediaDeliveryReplayFixture,
} from './copyright-route-replay-setup.mts'

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
  const [fixture, foreign] = await settleReplayFixtureOperations([
    createFailedMediaDeliveryReplayFixture(),
    createFailedMediaDeliveryReplayFixture(),
  ])
  const nonModeratorRequest = createRequest()
  await nonModeratorRequest.authenticateAs(fixture.nonModerator)
  await nonModeratorRequest.post('/api/v1/copyright-media-delivery/replays').expect(403)
  const acceptedReplay = vi.spyOn(mediaReplayEnqueues, 'enqueueReplayMediaDeliveryRegistry')
  onTestFinished(() => acceptedReplay.mockRestore())
  const moderatorRequest = createRequest()
  await moderatorRequest.authenticateAs(fixture.moderator)
  const response = await moderatorRequest
    .post('/api/v1/copyright-media-delivery/replays')
    .expect(202)
  expect(response.body).toEqual({})
  expect(acceptedReplay).toHaveBeenCalledExactlyOnceWith({ actorUserId: fixture.moderator.id })
  const accepted = acceptedReplay.mock.results[0]
  if (accepted?.type !== 'return') throw new Error('Replay route did not accept its real queue job')
  const job = await readEnqueuedJob(notifications, await accepted.value)
  expect(job).toMatchObject({
    name: 'processReplayMediaDeliveryRegistry',
    data: { actorUserId: fixture.moderator.id },
  })
  expect(job.data).not.toHaveProperty('after')
  const replayOwned = (recordIds: readonly string[]) =>
    replayFailedMediaDeliveryRegistryRecords({
      actorUserId: fixture.moderator.id,
      recordIds,
    })
  expect(await replayOwned([fixture.mediaDeliveryRegistryRecordId])).toMatchObject({ replayed: 1 })
  expect(await replayOwned([fixture.mediaDeliveryRegistryRecordId])).toMatchObject({ replayed: 0 })
  await expectOneReplayAudit(fixture, 'media_delivery_registry_replayed')
  expect(
    await countTestCopyrightLifecycleEvents({
      noticeId: foreign.noticeId,
      eventType: 'media_delivery_registry_replayed',
      actorUserId: fixture.moderator.id,
    }),
  ).toBe(0)
  return true
}

export async function exhaustCopyrightActionIntent(intentId: string): Promise<void> {
  const startedAt = new Date()
  const failedPublish = async () => Promise.reject(new Error('provider outage'))
  await expectCopyrightActionDeliveryFailures(intentId, startedAt, failedPublish, [0, 20, 40, 60])
  await expect(
    processCopyrightActionIntent(intentId, new Date(startedAt.getTime() + 80 * 60_000), {
      ...createTestCopyrightDeliveryDependencies(failedPublish),
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
      ...createTestCopyrightDeliveryDependencies(failedPublish),
    }),
  ).rejects.toThrow('provider outage')
  await expectCopyrightActionDeliveryFailures(intentId, startedAt, failedPublish, remainingOffsets)
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
