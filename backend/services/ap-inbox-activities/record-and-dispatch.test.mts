import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { getActorUri } from '@modules/activitypub-uris'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { getEntityRelation, readAllQueueJobs, readEnqueuedJob } from '@voucha/test-helpers'
import { recordAndDispatchInboundActivity } from './record-and-dispatch.mts'
import { recordInboxActivity } from './record-activity.mts'
import {
  createRemoteActorFixture,
  createFederatedUser,
  acceptJobsFor,
} from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations'
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
    const followRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'remote_actor',
      objectType: 'user',
      predicate: 'follow',
    })
    expect(await getEntityRelation(followRelation.table_name, remoteActor.id, user.id)).toEqual([])
    expect(result).not.toHaveProperty('postCommitEnqueue')
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(acceptJobsFor(jobs, activityId)).toHaveLength(0)

    await activityPubInboxDeliveryTransitions.claim(
      accepted.value.deliveryId,
      accepted.value.leaseToken,
    )
    await activityPubInboxDeliveryTransitions.reject(
      accepted.value.deliveryId,
      accepted.value.leaseToken,
    )
  })
})

describe('recordAndDispatchInboundActivity duplicate Follow Accept resend', () => {
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
    expect(replay).toMatchObject({ outcome: 'applied', duplicate: true })
    expect(replay.postCommitEnqueue).toBeDefined()
    const acceptJob = await readEnqueuedJob(activitypubDelivery, await replay.postCommitEnqueue)
    const followRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'remote_actor',
      objectType: 'user',
      predicate: 'follow',
    })
    const relation = await getEntityRelation(followRelation.table_name, remoteActor.id, user.id)
    expect(relation).toHaveLength(1)
    expect(relation[0]).toMatchObject({ deleted_at: null })

    const acceptJobs = acceptJobsFor([acceptJob], followActivityId)
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
    expect(first).toMatchObject({ outcome: 'applied', duplicate: false })
    expect(first.postCommitEnqueue).toBeDefined()
    const originalAcceptJob = await readEnqueuedJob(
      activitypubDelivery,
      await first.postCommitEnqueue,
    )
    const ownedAcceptJobsBeforeUndo = acceptJobsFor([originalAcceptJob], followActivityId)
    expect(ownedAcceptJobsBeforeUndo).toHaveLength(1)

    const undoActivity = {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Undo',
      actor: remoteActor.actor_uri,
      object: { type: 'Follow', object: getActorUri(user.id) },
    }
    const undoResult = await recordAndDispatchInboundActivity(remoteActor, undoActivity)
    expect(undoResult).toEqual({ outcome: 'applied', duplicate: false })

    const staleReplay = await recordAndDispatchInboundActivity(remoteActor, followActivity)
    expect(staleReplay).toMatchObject({ outcome: 'applied', duplicate: true })
    expect(staleReplay).not.toHaveProperty('postCommitEnqueue')

    const followRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'remote_actor',
      objectType: 'user',
      predicate: 'follow',
    })
    const relation = await getEntityRelation(followRelation.table_name, remoteActor.id, user.id)
    expect(relation).toHaveLength(1)
    expect(relation[0]).toMatchObject({ deleted_at: expect.any(Date) })

    const jobsAfterReplay = await readAllQueueJobs(activitypubDelivery)
    expect(acceptJobsFor(jobsAfterReplay, followActivityId)).toEqual(ownedAcceptJobsBeforeUndo)
  })
})
