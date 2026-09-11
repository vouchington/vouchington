import { describe, expect, it } from 'vitest'
import { createTestPost } from '@voucha/test-helpers'
import { recordLike } from './record-like.mts'
import { undoLike } from './undo-like.mts'
import { getApPostLikesTally } from './get-tally.mts'
import { createRemoteActorFixture } from './test-fixtures.mts'

describe('recordLike', () => {
  it('creates the ap_posts tally on the first Like', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()

    await recordLike(post.id, remoteActor.id, `https://remote.example/activities/${remoteActor.id}`)

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })
  })

  it('is idempotent for a redelivered Like carrying the same activity id', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()
    const likeApId = `https://remote.example/activities/${remoteActor.id}`

    await recordLike(post.id, remoteActor.id, likeApId)
    await recordLike(post.id, remoteActor.id, likeApId)

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })
  })

  it('tallies one like per distinct remote actor', async () => {
    const post = await createTestPost()
    const first = await createRemoteActorFixture()
    const second = await createRemoteActorFixture()

    await recordLike(post.id, first.id, `https://remote.example/activities/${first.id}`)
    await recordLike(post.id, second.id, `https://remote.example/activities/${second.id}`)

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 2, ap_likes_count: 2 })
  })

  it('resurrects the soft-deleted row instead of inserting a duplicate after an Undo', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()

    await recordLike(
      post.id,
      remoteActor.id,
      `https://remote.example/activities/${remoteActor.id}-first-like`,
    )
    await undoLike(post.id, remoteActor.id)
    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 0, ap_likes_count: 0 })

    await recordLike(
      post.id,
      remoteActor.id,
      `https://remote.example/activities/${remoteActor.id}-second-like`,
    )

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })
  })

  it('survives repeated Like/Undo cycles from the same actor without conflicting on stale soft-deleted rows', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()

    for (const suffix of ['one', 'two', 'three']) {
      await recordLike(
        post.id,
        remoteActor.id,
        `https://remote.example/activities/${remoteActor.id}-${suffix}`,
      )
      await undoLike(post.id, remoteActor.id)
    }
    await recordLike(
      post.id,
      remoteActor.id,
      `https://remote.example/activities/${remoteActor.id}-final`,
    )

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })
  })
})
