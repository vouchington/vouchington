import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getActorUri } from '@modules/activitypub-uris'
import { readAllQueueJobs, readEnqueuedJob } from '@voucha/test-helpers'
import {
  withCommittedPostgresTransactionForTest,
  withPostgresTransactionForTest,
} from '@voucha/test-helpers/postgres-transaction'
import {
  createRemoteActorFixture,
  createFederatedUser,
  acceptJobsFor,
} from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { backgroundQueue as activitypub } from '@voucha/test-helpers/shared-background-queue'
import { recordAndDispatchInboundActivity } from './record-and-dispatch.mts'
import { recordInboxActivity } from './record-activity.mts'

describe('recordAndDispatchInboundActivity borrowed transactions', () => {
  it('admits the owned Accept after the caller commits, while another completed Follow proves the precommit absence', async () => {
    const [remoteActor, siblingActor, user, siblingUser] = await Promise.all([
      createRemoteActorFixture(),
      createRemoteActorFixture(),
      createFederatedUser(),
      createFederatedUser(),
    ])
    const followActivity = {
      signedAt: new Date(),
      id: `https://remote.example/activities/${randomUUID()}`,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }
    const siblingActivity = {
      signedAt: new Date(),
      id: `https://remote.example/activities/${randomUUID()}`,
      type: 'Follow',
      actor: siblingActor.actor_uri,
      object: getActorUri(siblingUser.id),
    }

    await withCommittedPostgresTransactionForTest(async query => {
      const sibling = await recordAndDispatchInboundActivity(siblingActor, siblingActivity)
      const siblingJob = await readEnqueuedJob(activitypub, await sibling.postCommitEnqueue)
      expect(acceptJobsFor([siblingJob], siblingActivity.id)).toHaveLength(1)
      await expect(
        recordAndDispatchInboundActivity(remoteActor, followActivity, { query }),
      ).resolves.toEqual({ duplicate: false })
      expect(acceptJobsFor(await readAllQueueJobs(activitypub), followActivity.id)).toEqual([])
    })

    const acceptJobs = acceptJobsFor(await readAllQueueJobs(activitypub), followActivity.id)
    expect(acceptJobs).toHaveLength(1)
    expect(acceptJobs[0]).toMatchObject({
      activityType: 'Accept',
      sourceUserId: user.id,
      inboxUrl: remoteActor.inbox_url,
      followActivityId: followActivity.id,
      followActorUri: remoteActor.actor_uri,
    })
  })

  it('rolls back both inbox markers and the owned Accept with its caller', async () => {
    const [remoteActor, siblingActor, user, siblingUser] = await Promise.all([
      createRemoteActorFixture(),
      createRemoteActorFixture(),
      createFederatedUser(),
      createFederatedUser(),
    ])
    const followActivity = {
      signedAt: new Date(),
      id: `https://remote.example/activities/${randomUUID()}`,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }
    const announceActivity = {
      signedAt: new Date(),
      id: `https://remote.example/activities/${randomUUID()}`,
      type: 'Announce',
      actor: remoteActor.actor_uri,
      object: 'https://voucha.test/ap/posts/some-post',
    }
    await withPostgresTransactionForTest(async query => {
      await expect(
        recordAndDispatchInboundActivity(remoteActor, followActivity, { query }),
      ).resolves.toEqual({ duplicate: false })
      await expect(
        recordAndDispatchInboundActivity(remoteActor, announceActivity, { query }),
      ).resolves.toEqual({ duplicate: false })
    })

    const siblingActivity = {
      signedAt: new Date(),
      id: `https://remote.example/activities/${randomUUID()}`,
      type: 'Follow',
      actor: siblingActor.actor_uri,
      object: getActorUri(siblingUser.id),
    }
    const sibling = await recordAndDispatchInboundActivity(siblingActor, siblingActivity)
    const siblingJob = await readEnqueuedJob(activitypub, await sibling.postCommitEnqueue)
    expect(acceptJobsFor([siblingJob], siblingActivity.id)).toHaveLength(1)
    await expect(
      recordInboxActivity(followActivity.id, followActivity.type, followActivity.actor),
    ).resolves.toBe(true)
    await expect(
      recordInboxActivity(announceActivity.id, announceActivity.type, announceActivity.actor),
    ).resolves.toBe(true)
    expect(acceptJobsFor(await readAllQueueJobs(activitypub), followActivity.id)).toEqual([])
  })
})
