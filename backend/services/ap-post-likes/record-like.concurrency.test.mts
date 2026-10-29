import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestPost } from '@voucha/test-helpers'
import {
  getTestActiveApPostLikeActivityId,
  getTestApPostLikesTally,
} from '@voucha/test-helpers/entities/ap-post-likes'
import { recordLike } from './record-like.mts'
import { undoLike } from './undo-like.mts'
import {
  createRemoteActorFixture,
  isActivityPubLikePairLockAvailableForTest,
} from '@voucha/test-helpers/ap-post-likes-fixtures'

// Regression test for the TOCTOU race fn_project_activitypub_post_likes used to have (see the trigger's
// comment in the activitypub_post_likes migration): the old trigger read
// `SELECT count(*) ... WHERE deleted_at IS NULL` before writing it back to post_activitypub_like_tallies, so two
// concurrent Like inserts for the same post from different remote actors could each compute their
// count from a snapshot that didn't see the other's uncommitted insert — both then wrote the same
// stale value, undercounting the tally by one regardless of commit order. The fixed trigger applies
// an atomic `post_activitypub_like_tallies.col + v_delta` upsert instead, serialized by Postgres's own row lock on the
// post_activitypub_like_tallies row, so there is no read-then-write window left to race.
//
// This drives genuinely concurrent DB connections — Promise.all hands each in-flight write() call
// its own pool connection, the same mechanism services/users/__tests__/create.concurrency.test.mts
// relies on — rather than asserting against mocked timing.
describe('recordLike concurrency', () => {
  it('serializes replacement with Undo of the previous activity', async () => {
    const post = await createTestPost()
    const remoteActor = await createRemoteActorFixture()
    const firstId = `https://remote.example/activities/${remoteActor.id}-first`
    const replacementId = `https://remote.example/activities/${remoteActor.id}-replacement`
    await recordLike(post.id, remoteActor.id, firstId)

    await using undoTransaction = await beginTransaction()
    const firstUndoQueryCompleted = Promise.withResolvers<void>()
    const releaseUndo = Promise.withResolvers<void>()
    const pausedUndoQuery = new Proxy(undoTransaction, {
      async apply(target, thisArg, args: Parameters<typeof undoTransaction>) {
        const result = await Reflect.apply(target, thisArg, args)
        const statement = args[0]
        const text = typeof statement === 'string' ? statement : statement.text
        if (text.includes('/* lockActivityPubLikePairForUndo */')) {
          firstUndoQueryCompleted.resolve()
          await releaseUndo.promise
        }
        return result
      },
    })
    const undo = undoLike(post.id, remoteActor, firstId, { query: pausedUndoQuery })
    await firstUndoQueryCompleted.promise
    let pairLockAvailable: boolean
    let replacement: Promise<void>
    try {
      pairLockAvailable = await isActivityPubLikePairLockAvailableForTest(post.id, remoteActor.id)
      replacement = recordLike(post.id, remoteActor.id, replacementId)
    } finally {
      releaseUndo.resolve()
    }
    await undo
    await undoTransaction.commit()
    await replacement

    expect(pairLockAvailable).toBe(false)
    expect(await getTestActiveApPostLikeActivityId(post.id, remoteActor.id)).toBe(replacementId)
    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 1,
      activitypub_likes_count: 1,
    })
  })

  it('tallies every concurrent Like from a distinct remote actor exactly once', async () => {
    const post = await createTestPost()
    const remoteActors = await Promise.all(
      Array.from({ length: 8 }, () => createRemoteActorFixture()),
    )

    await Promise.all(
      remoteActors.map(actor =>
        recordLike(post.id, actor.id, `https://remote.example/activities/${actor.id}`),
      ),
    )

    expect(await getTestApPostLikesTally(post.id)).toEqual({
      activitypub_likes_score: 8,
      activitypub_likes_count: 8,
    })
  })
})
