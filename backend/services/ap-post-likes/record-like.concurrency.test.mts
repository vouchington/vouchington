import { describe, expect, it } from 'vitest'
import { createTestPost } from '@voucha/test-helpers'
import { recordLike } from './record-like.mts'
import { getApPostLikesTally } from './get-tally.mts'
import { createRemoteActorFixture } from './test-fixtures.mts'

// Regression test for the TOCTOU race fn_sync_ap_post_likes used to have (see the trigger's
// comment in the ap_post_likes migration): the old trigger read
// `SELECT count(*) ... WHERE deleted_at IS NULL` before writing it back to ap_posts, so two
// concurrent Like inserts for the same post from different remote actors could each compute their
// count from a snapshot that didn't see the other's uncommitted insert — both then wrote the same
// stale value, undercounting the tally by one regardless of commit order. The fixed trigger applies
// an atomic `ap_posts.col + v_delta` upsert instead, serialized by Postgres's own row lock on the
// ap_posts row, so there is no read-then-write window left to race.
//
// This drives genuinely concurrent DB connections — Promise.all hands each in-flight write() call
// its own pool connection, the same mechanism services/users/__tests__/create.concurrency.test.mts
// relies on — rather than asserting against mocked timing.
describe('recordLike concurrency', () => {
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

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 8, ap_likes_count: 8 })
  })
})
