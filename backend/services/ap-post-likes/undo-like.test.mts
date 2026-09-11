import { describe, expect, it } from 'vitest'
import { createTestPost } from '@voucha/test-helpers'
import { recordLike } from './record-like.mts'
import { undoLike } from './undo-like.mts'
import { getApPostLikesTally } from './get-tally.mts'
import { createRemoteActorFixture } from './test-fixtures.mts'

describe('undoLike', () => {
  it('soft-deletes the active Like, dropping the tally to zero', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()
    await recordLike(post.id, remoteActor.id, `https://remote.example/activities/${remoteActor.id}`)

    await undoLike(post.id, remoteActor.id)

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 0, ap_likes_count: 0 })
  })

  it('is a no-op for an Undo that arrives before any Like', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()

    await expect(undoLike(post.id, remoteActor.id)).resolves.toBeUndefined()

    expect(await getApPostLikesTally(post.id)).toBeNull()
  })

  it('is a no-op for a redelivered Undo after the Like was already undone', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()
    await recordLike(post.id, remoteActor.id, `https://remote.example/activities/${remoteActor.id}`)
    await undoLike(post.id, remoteActor.id)

    await expect(undoLike(post.id, remoteActor.id)).resolves.toBeUndefined()

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 0, ap_likes_count: 0 })
  })

  it("only undoes the calling actor's like, leaving other actors' likes intact", async () => {
    const post = await createTestPost()
    const first = await createRemoteActorFixture()
    const second = await createRemoteActorFixture()
    await recordLike(post.id, first.id, `https://remote.example/activities/${first.id}`)
    await recordLike(post.id, second.id, `https://remote.example/activities/${second.id}`)

    await undoLike(post.id, first.id)

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })
  })
})
