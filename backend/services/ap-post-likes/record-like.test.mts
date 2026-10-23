import { describe, expect, it } from 'vitest'
import { createTestPost } from '@voucha/test-helpers'
import { getTestApPostLikesTally } from '@voucha/test-helpers/entities/ap-post-likes'
import { recordLike } from './record-like.mts'
import { undoLike } from './undo-like.mts'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-post-likes-fixtures'

describe('recordLike', () => {
  it('creates the post_activitypub_like_tallies tally on the first Like', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()

    await recordLike(post.id, remoteActor.id, `https://remote.example/activities/${remoteActor.id}`)

    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 1,
      activitypub_likes_count: 1,
    })
  })

  it('is idempotent for a redelivered Like carrying the same activity id', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()
    const likeApId = `https://remote.example/activities/${remoteActor.id}`

    await recordLike(post.id, remoteActor.id, likeApId)
    await recordLike(post.id, remoteActor.id, likeApId)

    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 1,
      activitypub_likes_count: 1,
    })
  })

  it('tallies one like per distinct remote actor', async () => {
    const post = await createTestPost()
    const first = await createRemoteActorFixture()
    const second = await createRemoteActorFixture()

    await recordLike(post.id, first.id, `https://remote.example/activities/${first.id}`)
    await recordLike(post.id, second.id, `https://remote.example/activities/${second.id}`)

    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 2,
      activitypub_likes_count: 2,
    })
  })

  it('keeps the undone identity while a fresh Like starts a new cycle', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()

    const firstId = `https://remote.example/activities/${remoteActor.id}-first-like`
    await recordLike(post.id, remoteActor.id, firstId)
    await undoLike(post.id, remoteActor.id, firstId)
    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 0,
      activitypub_likes_count: 0,
    })

    await recordLike(
      post.id,
      remoteActor.id,
      `https://remote.example/activities/${remoteActor.id}-second-like`,
    )

    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 1,
      activitypub_likes_count: 1,
    })
    await recordLike(post.id, remoteActor.id, firstId)
    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 1,
      activitypub_likes_count: 1,
    })
  })

  it('survives repeated Like/Undo cycles from the same actor without conflicting on stale soft-deleted rows', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()

    for (const suffix of ['one', 'two', 'three']) {
      const likeId = `https://remote.example/activities/${remoteActor.id}-${suffix}`
      await recordLike(post.id, remoteActor.id, likeId)
      await undoLike(post.id, remoteActor.id, likeId)
    }
    await recordLike(
      post.id,
      remoteActor.id,
      `https://remote.example/activities/${remoteActor.id}-final`,
    )

    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 1,
      activitypub_likes_count: 1,
    })
  })
})
