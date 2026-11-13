import { expect, onTestFinished, vi } from 'vitest'
import * as mediaReplayEnqueues from '@queues/notifications/enqueues/media-delivery-registry'
import { notifications } from '@queues/notifications/queues'
import { readEnqueuedJob } from './index.mts'
import { createRequest } from './api/server.mts'
import { countTestCopyrightLifecycleEvents } from './data-stores/psql/copyright-notice-reads.mts'
import { replayFailedMediaDeliveryRegistryRecords } from '../services/media-delivery-safety/index.mts'
import {
  settleReplayFixtureOperations,
  createFailedMediaDeliveryReplayFixture,
} from './copyright-route-replay-setup.mts'

/** The actual route/queue/owned record replay and untouched foreign audit assertions stay real. */
export async function verifyCommittedMediaDeliveryReplayRoute(): Promise<true> {
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
    name: 'notifications.processReplayMediaDeliveryRegistry',
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
  expect(
    await countTestCopyrightLifecycleEvents({
      noticeId: fixture.noticeId,
      eventType: 'media_delivery_registry_replayed',
      actorUserId: fixture.moderator.id,
    }),
  ).toBe(1)
  expect(
    await countTestCopyrightLifecycleEvents({
      noticeId: foreign.noticeId,
      eventType: 'media_delivery_registry_replayed',
      actorUserId: fixture.moderator.id,
    }),
  ).toBe(0)
  return true
}
