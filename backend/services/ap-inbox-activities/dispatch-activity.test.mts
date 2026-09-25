import { describe, it, expect } from 'vitest'
import { dispatchInboundActivity } from './dispatch-activity.mts'
import { createRemoteActorFixture, createFederatedUser } from './test-fixtures.mts'
import { type RemoteActorRow } from '@services/remote-actors'
import { getEntityRelations } from '@services/entity-relations'
import { getActorUri, getPostUri } from '@modules/activitypub-uris'
import { createTestPost, createTestUserDirect } from '@voucha/test-helpers'
import { getApPostLikesTally } from '@services/ap-post-likes'
import { SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations/viewer'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

async function hasFollowRelation(remoteActor: RemoteActorRow, userId: string): Promise<boolean> {
  const relations = await getEntityRelations('remote_actor', remoteActor.id, 'follow', 'user', {
    viewer: SYSTEM_ENTITY_RELATION_VIEWER,
  })
  return relations.some(relation => relation.object_id === userId)
}

describe('dispatchInboundActivity', () => {
  it('creates a follow relation for a Follow activity targeting a federated user', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()

    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    })

    expect(await hasFollowRelation(remoteActor, user.id)).toBe(true)
  })

  it('removes the follow relation for an Undo(Follow) activity', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createFederatedUser()
    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    })
    expect(await hasFollowRelation(remoteActor, user.id)).toBe(true)

    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Undo',
      actor: remoteActor.actor_uri,
      object: { type: 'Follow', object: getActorUri(user.id) },
    })

    expect(await hasFollowRelation(remoteActor, user.id)).toBe(false)
  })

  it('does not create a follow relation when the target user has not enabled federation', async () => {
    const remoteActor = await createRemoteActorFixture()
    const user = await createTestUserDirect()

    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: remoteActor.actor_uri,
      object: getActorUri(user.id),
    })

    expect(await hasFollowRelation(remoteActor, user.id)).toBe(false)
  })

  it('does not create a follow relation when the object is not a local actor URI', async () => {
    const remoteActor = await createRemoteActorFixture()

    await expect(
      dispatchInboundActivity(remoteActor, {
        id: `https://remote.example/activities/${randomSuffix()}`,
        type: 'Follow',
        actor: remoteActor.actor_uri,
        object: 'https://other-remote.example/users/bob',
      }),
    ).resolves.toBeUndefined()
  })

  // Guards against a Postgres invalid-input-syntax error surfacing from an attacker-controlled
  // non-UUID segment in an inbound Follow's `object` — see resolveFederatedTargetUserId.
  it('does not create a follow relation when the local actor URI segment is not UUID-shaped', async () => {
    const remoteActor = await createRemoteActorFixture()

    await expect(
      dispatchInboundActivity(remoteActor, {
        id: `https://remote.example/activities/${randomSuffix()}`,
        type: 'Follow',
        actor: remoteActor.actor_uri,
        object: getActorUri('not-a-uuid'),
      }),
    ).resolves.toBeUndefined()
  })

  it('silently no-ops for unsupported activity types', async () => {
    const remoteActor = await createRemoteActorFixture()

    await expect(
      dispatchInboundActivity(remoteActor, {
        id: `https://remote.example/activities/${randomSuffix()}`,
        type: 'Announce',
        actor: remoteActor.actor_uri,
        object: 'https://voucha.test/api/v1/posts/some-post',
      }),
    ).resolves.toBeUndefined()
  })

  it('silently no-ops for an Undo that does not wrap a Follow or a Like', async () => {
    const remoteActor = await createRemoteActorFixture()

    await expect(
      dispatchInboundActivity(remoteActor, {
        id: `https://remote.example/activities/${randomSuffix()}`,
        type: 'Undo',
        actor: remoteActor.actor_uri,
        object: { type: 'Announce', object: 'https://voucha.test/api/v1/posts/some-post' },
      }),
    ).resolves.toBeUndefined()
  })

  it('records a Like on the ap_post_likes ledger, never touching post_votes', async () => {
    const remoteActor = await createRemoteActorFixture()
    const post = await createTestPost()

    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${remoteActor.id}`,
      type: 'Like',
      actor: remoteActor.actor_uri,
      object: getPostUri(post.id),
    })

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })
  })

  it('removes the Like for an Undo(Like) activity', async () => {
    const remoteActor = await createRemoteActorFixture()
    const post = await createTestPost()
    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${remoteActor.id}`,
      type: 'Like',
      actor: remoteActor.actor_uri,
      object: getPostUri(post.id),
    })
    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })

    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Undo',
      actor: remoteActor.actor_uri,
      object: { type: 'Like', object: getPostUri(post.id) },
    })

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 0, ap_likes_count: 0 })
  })

  it('does not record a Like when the object is not a local post URI', async () => {
    const remoteActor = await createRemoteActorFixture()

    await expect(
      dispatchInboundActivity(remoteActor, {
        id: `https://remote.example/activities/${randomSuffix()}`,
        type: 'Like',
        actor: remoteActor.actor_uri,
        object: 'https://other-remote.example/posts/some-post',
      }),
    ).resolves.toBeUndefined()
  })

  it('does not record a Like when the target post does not exist', async () => {
    const remoteActor = await createRemoteActorFixture()

    await expect(
      dispatchInboundActivity(remoteActor, {
        id: `https://remote.example/activities/${randomSuffix()}`,
        type: 'Like',
        actor: remoteActor.actor_uri,
        object: getPostUri('00000000-0000-0000-0000-000000000000'),
      }),
    ).resolves.toBeUndefined()
  })

  // Phase C6 follow-up from the C2 review: a remote actor has no Voucha session, so it must never
  // be able to record a durable AP like tally against a post it could not otherwise view.
  it('does not record a Like against a private post (anonymous-viewer privacy gate)', async () => {
    const remoteActor = await createRemoteActorFixture()
    const post = await createTestPost({ privacy: 'private', broadcast: 'followers' })

    await dispatchInboundActivity(remoteActor, {
      id: `https://remote.example/activities/${randomSuffix()}`,
      type: 'Like',
      actor: remoteActor.actor_uri,
      object: getPostUri(post.id),
    })

    expect(await getApPostLikesTally(post.id)).toBeNull()
  })

  it('does not remove any tally for an Undo(Like) against a private post', async () => {
    const remoteActor = await createRemoteActorFixture()
    const post = await createTestPost({ privacy: 'private', broadcast: 'followers' })

    await expect(
      dispatchInboundActivity(remoteActor, {
        id: `https://remote.example/activities/${randomSuffix()}`,
        type: 'Undo',
        actor: remoteActor.actor_uri,
        object: { type: 'Like', object: getPostUri(post.id) },
      }),
    ).resolves.toBeUndefined()

    expect(await getApPostLikesTally(post.id)).toBeNull()
  })
})
