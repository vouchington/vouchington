import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { getActorUri } from '@modules/activitypub-uris'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import {
  advanceFederationReplayFloorForTest,
  deleteFederationInboxActivityForTest,
  getEntityRelation,
  readAllQueueJobs,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { recordAndDispatchInboundActivity } from './record-and-dispatch.mts'
import { recordInboxActivity } from './record-activity.mts'
import {
  createRemoteActorFixture,
  createFederatedUser,
  acceptJobsFor,
} from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { activitypub } from '@queues/activitypub/queues'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations'
import type { RemoteActorRow } from '@services/remote-actors'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import {
  acceptTestDelivery,
  registerActivityPubInboxAdmission,
} from '@voucha/test-helpers/activitypub-inbox-transitions'

registerActivityPubInboxAdmission()
import { activityPubInboxConfig, getMaximumActivityAgeDays } from './config.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

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
  it('rejects a retired signed date after the configured age is widened', async () => {
    const remoteActor = makeUnpersistedRemoteActor()
    const id = `https://remote.example/activities/${randomSuffix()}`
    const signedAt = new Date(Date.now() - 40 * 86_400_000)
    await withCommittedPostgresTransactionForTest(query =>
      advanceFederationReplayFloorForTest(query, 'inbox', signedAt),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        maximum_activity_age_days: 60,
      }),
    )
    await expect(
      recordAndDispatchInboundActivity(remoteActor, {
        id,
        type: 'Announce',
        actor: remoteActor.actor_uri,
        object: 'https://voucha.test/ap/posts/some-post',
        signedAt,
      }),
    ).rejects.toMatchObject({ status: 401, message: 'Activity signature date is retired' })
  })

  it('rejects a signed request beyond the configured age before reserving its identity', async () => {
    const remoteActor = makeUnpersistedRemoteActor()
    const id = `https://remote.example/activities/${randomSuffix()}`
    const signedAt = new Date(Date.now() - (getMaximumActivityAgeDays() + 1) * 86_400_000)
    await expect(
      recordAndDispatchInboundActivity(remoteActor, {
        id,
        type: 'Announce',
        actor: remoteActor.actor_uri,
        object: 'https://voucha.test/ap/posts/some-post',
        signedAt,
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(await recordInboxActivity(id, 'Announce', remoteActor.actor_uri)).toBe(true)
  })

  it('accepts and deduplicates a signed request inside the configured age', async () => {
    const remoteActor = makeUnpersistedRemoteActor()
    const activity = {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Announce',
      actor: remoteActor.actor_uri,
      object: 'https://voucha.test/ap/posts/some-post',
      signedAt: new Date(Date.now() - (getMaximumActivityAgeDays() - 1) * 86_400_000),
    }
    expect(await recordAndDispatchInboundActivity(remoteActor, activity)).toMatchObject({
      duplicate: false,
    })
    expect(await recordAndDispatchInboundActivity(remoteActor, activity)).toMatchObject({
      duplicate: true,
    })
    await withCommittedPostgresTransactionForTest(query =>
      deleteFederationInboxActivityForTest(query, activity.id),
    )
    await expect(
      recordAndDispatchInboundActivity(remoteActor, {
        ...activity,
        signedAt: new Date(Date.now() - (getMaximumActivityAgeDays() + 1) * 86_400_000),
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)
  })
  it('reports a replay as duplicate without re-dispatching', async () => {
    const remoteActor = makeUnpersistedRemoteActor()
    const activityId = `https://remote.example/activities/${randomSuffix()}`
    const first = await recordAndDispatchInboundActivity(remoteActor, {
      signedAt: new Date(),
      id: activityId,
      type: 'Announce',
      actor: remoteActor.actor_uri,
      object: 'https://voucha.test/api/v1/posts/some-post',
    })
    expect(first).toEqual({ outcome: 'applied', duplicate: false })

    const replay = await recordAndDispatchInboundActivity(remoteActor, {
      signedAt: new Date(),
      id: activityId,
      type: 'Announce',
      actor: remoteActor.actor_uri,
      object: 'https://voucha.test/api/v1/posts/some-post',
    })

    expect(replay).toEqual({ outcome: 'applied', duplicate: true })
  })

  it('rolls back the dedup marker when a Follow actor has no live row', async () => {
    const remoteActor = makeUnpersistedRemoteActor()
    const user = await createFederatedUser()
    const activityId = `https://remote.example/activities/${randomSuffix()}`
    const activity = {
      signedAt: new Date(),
      id: activityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }

    await expect(recordAndDispatchInboundActivity(remoteActor, activity)).rejects.toThrow(
      'ActivityPub Follow id belongs to another actor or target',
    )

    const isFirstSeenAgain = await recordInboxActivity(activityId, activity.type, activity.actor)
    expect(isFirstSeenAgain).toBe(true)
  })

  it('rolls back duplicate Follow recovery when durable-envelope completion loses its lease', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const activityId = `https://remote.example/activities/${randomSuffix()}`
    const activity = {
      signedAt: new Date(),
      id: activityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }
    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)
    const delivery = await acceptTestDelivery({
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

    const result = await recordAndDispatchInboundActivity(remoteActor, activity, delivery)

    expect(result).toEqual({ outcome: 'stale', duplicate: false })
    const followRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'remote_actor',
      objectType: 'user',
      predicate: 'follow',
    })
    expect(await getEntityRelation(followRelation.table_name, remoteActor.id, user.id)).toEqual([])
    expect(result).not.toHaveProperty('postCommitEnqueue')
    const jobs = await readAllQueueJobs(activitypub)
    expect(acceptJobsFor(jobs, activityId)).toHaveLength(0)

    await activityPubInboxDeliveryTransitions.claim(delivery.deliveryId, delivery.leaseToken)
    await activityPubInboxDeliveryTransitions.reject(delivery.deliveryId, delivery.leaseToken)
  })
})

describe('recordAndDispatchInboundActivity duplicate Follow Accept resend', () => {
  it('recovers a lost post-commit Accept when the committed Follow is redelivered', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const followActivityId = `https://remote.example/activities/${randomSuffix()}`
    const activity = {
      signedAt: new Date(),
      id: followActivityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }

    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)

    const replay = await recordAndDispatchInboundActivity(remoteActor, activity)
    expect(replay).toMatchObject({ outcome: 'applied', duplicate: true })
    expect(replay.postCommitEnqueue).toBeDefined()
    const acceptJob = await readEnqueuedJob(activitypub, await replay.postCommitEnqueue)
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

  it('does not resurrect a relation, or resend an Accept, for a stale duplicate Follow after Undo(Follow)', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const followActivityId = `https://remote.example/activities/${randomSuffix()}`
    const followActivity = {
      signedAt: new Date(),
      id: followActivityId,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }

    const first = await recordAndDispatchInboundActivity(remoteActor, followActivity)
    expect(first).toMatchObject({ outcome: 'applied', duplicate: false })
    expect(first.postCommitEnqueue).toBeDefined()
    const originalAcceptJob = await readEnqueuedJob(activitypub, await first.postCommitEnqueue)
    const ownedAcceptJobsBeforeUndo = acceptJobsFor([originalAcceptJob], followActivityId)
    expect(ownedAcceptJobsBeforeUndo).toHaveLength(1)

    const undoActivity = {
      signedAt: new Date(),
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Undo',
      actor: remoteActor.actor_uri,
      object: { id: followActivityId, type: 'Follow', object: getActorUri(user.id) },
    }
    const undoResult = await recordAndDispatchInboundActivity(remoteActor, undoActivity)
    expect(undoResult).toEqual({ outcome: 'applied', duplicate: false })

    const staleReplay = await recordAndDispatchInboundActivity(remoteActor, followActivity)
    expect(staleReplay).toMatchObject({ outcome: 'applied', duplicate: true })
    expect(staleReplay).not.toHaveProperty('postCommitEnqueue')

    await withCommittedPostgresTransactionForTest(query =>
      deleteFederationInboxActivityForTest(query, followActivityId),
    )
    const freshSignatureReplay = await recordAndDispatchInboundActivity(remoteActor, {
      ...followActivity,
      signedAt: new Date(),
    })
    expect(freshSignatureReplay).toMatchObject({ outcome: 'applied', duplicate: false })
    expect(freshSignatureReplay).not.toHaveProperty('postCommitEnqueue')

    const followRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'remote_actor',
      objectType: 'user',
      predicate: 'follow',
    })
    const relation = await getEntityRelation(followRelation.table_name, remoteActor.id, user.id)
    expect(relation).toHaveLength(1)
    expect(relation[0]).toMatchObject({ deleted_at: expect.any(Date) })

    const jobsAfterReplay = await readAllQueueJobs(activitypub)
    expect(acceptJobsFor(jobsAfterReplay, followActivityId)).toEqual(ownedAcceptJobsBeforeUndo)
  })
})
