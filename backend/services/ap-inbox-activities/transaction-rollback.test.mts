import { describe, expect, it } from 'vitest'
import { getActorUri, getPostUri } from '@modules/activitypub-uris'
import { getApPostLikesTally } from '@services/ap-post-likes'
import {
  getEntityRelationDeletionState,
  getEntityRelationMetadataOrThrow,
  upsertEntityRelation,
} from '@services/entity-relations'
import { createTestPost, withForcedTransactionRollbackForTest } from '@voucha/test-helpers'
import { dispatchInboundActivity } from './dispatch-activity.mts'
import { recordInboxActivity } from './record-activity.mts'
import { createFederatedUser, createRemoteActorFixture } from './test-fixtures.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)
const followRelation = () =>
  getEntityRelationMetadataOrThrow({
    subjectType: 'remote_actor',
    objectType: 'user',
    predicate: 'follow',
  })

describe('inbound ActivityPub transaction rollback', () => {
  it('rolls back a successful Follow write when a later statement aborts', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const activity = {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    }

    await expect(
      withForcedTransactionRollbackForTest(async queryOptions => {
        expect(
          await recordInboxActivity(activity.id, activity.type, activity.actor, queryOptions),
        ).toBe(true)
        await dispatchInboundActivity(remoteActor, activity, queryOptions)
      }),
    ).rejects.toThrow('Injected transaction rollback for test')

    expect(
      await getEntityRelationDeletionState(
        followRelation(),
        { id: remoteActor.id },
        { id: user.id },
      ),
    ).toBe('absent')
    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)
  })

  it('rolls back Undo(Follow) and its marker when a later statement aborts', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const relation = followRelation()
    await upsertEntityRelation(null, relation, { id: remoteActor.id }, [{ id: user.id }], {
      origin: 'remote',
    })
    const activity = {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Undo',
      actor: remoteActor.actor_uri,
      object: { type: 'Follow', object: getActorUri(user.id) },
    }

    await expect(
      withForcedTransactionRollbackForTest(async queryOptions => {
        await recordInboxActivity(activity.id, activity.type, activity.actor, queryOptions)
        await dispatchInboundActivity(remoteActor, activity, queryOptions)
      }),
    ).rejects.toThrow('Injected transaction rollback for test')

    expect(
      await getEntityRelationDeletionState(relation, { id: remoteActor.id }, { id: user.id }),
    ).toBe('active')
    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)
  })

  it('rolls back Like and its marker when a later statement aborts', async () => {
    const remoteActor = await createRemoteActorFixture()
    const post = await createTestPost()
    const activity = {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Like',
      actor: remoteActor.actor_uri,
      object: getPostUri(post.id),
    }

    await expect(
      withForcedTransactionRollbackForTest(async queryOptions => {
        await recordInboxActivity(activity.id, activity.type, activity.actor, queryOptions)
        await dispatchInboundActivity(remoteActor, activity, queryOptions)
      }),
    ).rejects.toThrow('Injected transaction rollback for test')

    expect(await getApPostLikesTally(post.id)).toBeNull()
    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)
  })

  it('rolls back Undo(Like) and its marker when a later statement aborts', async () => {
    const remoteActor = await createRemoteActorFixture()
    const post = await createTestPost()
    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Like',
      actor: remoteActor.actor_uri,
      object: getPostUri(post.id),
    })
    const activity = {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Undo',
      actor: remoteActor.actor_uri,
      object: { type: 'Like', object: getPostUri(post.id) },
    }

    await expect(
      withForcedTransactionRollbackForTest(async queryOptions => {
        await recordInboxActivity(activity.id, activity.type, activity.actor, queryOptions)
        await dispatchInboundActivity(remoteActor, activity, queryOptions)
      }),
    ).rejects.toThrow('Injected transaction rollback for test')

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })
    expect(await recordInboxActivity(activity.id, activity.type, activity.actor)).toBe(true)
  })
})
