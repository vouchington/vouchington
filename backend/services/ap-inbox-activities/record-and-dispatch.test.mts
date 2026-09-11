import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { getActorUri } from '@modules/activitypub-uris'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { recordAndDispatchInboundActivity } from './record-and-dispatch.mts'
import { recordInboxActivity } from './record-activity.mts'
import {
  createRemoteActorFixture,
  createFederatedUser,
  waitForDeliverActivityJobs,
  acceptJobsFor,
} from './test-fixtures.mts'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import {
  getEntityRelationDeletionState,
  getEntityRelationMetadataOrThrow,
} from '@services/entity-relations'
import type { RemoteActorRow } from '@services/remote-actors'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

function makeUnpersistedRemoteActor(): RemoteActorRow {
  const actorUri = `https://remote.example/users/${randomSuffix()}`
  return {
    id: randomUUID(),
    actor_uri: actorUri,
    key_id: `${actorUri}#main-key`,
    public_key_pem: generateRsaSha256KeyPair().publicKeyPem,
    inbox_url: `${actorUri}/inbox`,
    shared_inbox_url: null,
    fetched_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    hostname_id: null,
  }
}

describe('recordAndDispatchInboundActivity', () => {
  it('reports a replay as duplicate without re-dispatching', async () => {
    const remoteActor = makeUnpersistedRemoteActor()
    const activityId = `https://remote.example/activities/${randomSuffix()}`
    // First call must succeed all the way through so the dedup marker is durably left in place —
    // an unsupported activity type dispatches to a no-op, never throwing.
    const first = await recordAndDispatchInboundActivity(remoteActor, {
      id: activityId,
      type: 'Announce',
      actor: remoteActor.actor_uri,
      object: 'https://voucha.test/api/v1/posts/some-post',
    })
    expect(first).toEqual({ outcome: 'applied', duplicate: false })

    const replay = await recordAndDispatchInboundActivity(remoteActor, {
      id: activityId,
      type: 'Announce',
      actor: remoteActor.actor_uri,
      object: 'https://voucha.test/api/v1/posts/some-post',
    })

    expect(replay).toEqual({ outcome: 'applied', duplicate: true })
  })

  it('rolls back the dedup marker atomically when the core database effect fails', async () => {
    const remoteActor = makeUnpersistedRemoteActor()
    const user = await createFederatedUser()
    const activityId = `https://remote.example/activities/${randomSuffix()}`
    const activity = {
      id: activityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }

    await expect(recordAndDispatchInboundActivity(remoteActor, activity)).rejects.toThrow(
      'foreign key constraint',
    )

    // The failed relation write and reservation share a transaction, so the retry can reserve it.
    const isFirstSeenAgain = await recordInboxActivity(activityId, activity.type, activity.actor)
    expect(isFirstSeenAgain).toBe(true)
  })

  it('rolls back duplicate Follow recovery when durable-envelope completion loses its lease', async () => {
    await activitypubDelivery.obliterate({ force: true })
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const activityId = `https://remote.example/activities/${randomSuffix()}`
    const activity = {
      id: activityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }
    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)
    const accepted = await activityPubInboxDeliveryTransitions.accept({
      requestMethod: 'POST',
      requestTarget: '/ap/inbox',
      expectedHost: 'voucha.test',
      signatureHeader: 'signature',
      digestHeader: 'digest',
      dateHeader: new Date().toUTCString(),
      rawBody: Buffer.from('{}'),
      claimedActivityId: activityId,
      claimedActivityType: 'Follow',
      claimedActorUri: remoteActor.actor_uri,
      senderHostname: 'remote.example',
    })
    if (accepted.outcome !== 'applied')
      throw new Error('Test delivery unexpectedly exceeded capacity')

    const result = await recordAndDispatchInboundActivity(remoteActor, activity, accepted.value)

    expect(result).toEqual({ outcome: 'stale', duplicate: false })
    expect(
      await getEntityRelationDeletionState(
        getEntityRelationMetadataOrThrow({
          subjectType: 'remote_actor',
          objectType: 'user',
          predicate: 'follow',
        }),
        { id: remoteActor.id },
        { id: user.id },
      ),
    ).toBe('absent')
    // Fence queue commands issued by the completed service call before reading once. Polling for
    // an event that must remain absent would otherwise hammer every queue state until timeout.
    await activitypubDelivery.getJobCounts()
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(acceptJobsFor(jobs, activityId)).toHaveLength(0)

    await activityPubInboxDeliveryTransitions.claim(
      accepted.value.deliveryId,
      accepted.value.processingAttemptId,
    )
    await activityPubInboxDeliveryTransitions.reject(
      accepted.value.deliveryId,
      accepted.value.processingAttemptId,
    )
  })
})

describe('recordAndDispatchInboundActivity duplicate Follow Accept resend', () => {
  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
  })

  it('recovers a lost post-commit Accept when the committed Follow is redelivered', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const followActivityId = `https://remote.example/activities/${randomSuffix()}`
    const activity = {
      id: followActivityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }

    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)

    const replay = await recordAndDispatchInboundActivity(remoteActor, activity)
    expect(replay).toEqual({ outcome: 'applied', duplicate: true })
    expect(
      await getEntityRelationDeletionState(
        getEntityRelationMetadataOrThrow({
          subjectType: 'remote_actor',
          objectType: 'user',
          predicate: 'follow',
        }),
        { id: remoteActor.id },
        { id: user.id },
      ),
    ).toBe('active')

    const jobs = await waitForDeliverActivityJobs(
      j => acceptJobsFor(j, followActivityId).length > 0,
    )
    const acceptJobs = acceptJobsFor(jobs, followActivityId)
    expect(acceptJobs).toHaveLength(1)
    expect(acceptJobs[0]).toMatchObject({
      activityType: 'Accept',
      sourceUserId: user.id,
      inboxUrl: remoteActor.inbox_url,
      followActivityId,
      followActorUri: remoteActor.actor_uri,
    })
  })

  // Round-7 re-review fix: a stale/out-of-order redelivery of the *original* Follow id, arriving
  // after the sender already sent Undo(Follow), must not resurrect the relation just because the
  // dedup ledger treats it as a duplicate delivery.
  it('does not resurrect a relation, or resend an Accept, for a stale duplicate Follow after Undo(Follow)', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const followActivityId = `https://remote.example/activities/${randomSuffix()}`
    const followActivity = {
      id: followActivityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }

    const first = await recordAndDispatchInboundActivity(remoteActor, followActivity)
    expect(first).toEqual({ outcome: 'applied', duplicate: false })
    await waitForDeliverActivityJobs(jobs => acceptJobsFor(jobs, followActivityId).length > 0)

    const undoActivity = {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Undo',
      actor: remoteActor.actor_uri,
      object: { type: 'Follow', object: getActorUri(user.id) },
    }
    const undoResult = await recordAndDispatchInboundActivity(remoteActor, undoActivity)
    expect(undoResult).toEqual({ outcome: 'applied', duplicate: false })

    await activitypubDelivery.obliterate({ force: true })

    const staleReplay = await recordAndDispatchInboundActivity(remoteActor, followActivity)
    expect(staleReplay).toEqual({ outcome: 'applied', duplicate: true })

    const deletionState = await getEntityRelationDeletionState(
      getEntityRelationMetadataOrThrow({
        subjectType: 'remote_actor',
        objectType: 'user',
        predicate: 'follow',
      }),
      { id: remoteActor.id },
      { id: user.id },
    )
    expect(deletionState).toBe('deleted')

    await activitypubDelivery.getJobCounts()
    const jobsAfterReplay = await readAllQueueJobs(activitypubDelivery)
    expect(acceptJobsFor(jobsAfterReplay, followActivityId)).toHaveLength(0)
  })
})
