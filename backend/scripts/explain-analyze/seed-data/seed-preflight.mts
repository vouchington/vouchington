import { assertNoLeftoverCommentPartitions } from './comment-descendant-partition-storage.mts'
import { assertNoLeftoverHackerNewsScalePartitions } from './hacker-news-scale-fixture.mts'
import { SEED_ANCHOR_DATE_ENV, assertSeedAnchorNotFuture } from './seed-anchor.mts'

/** Reject a dirty #4990 corpus before any ordinary EXPLAIN seed writes begin. */
export async function assertExplainSeedReady(): Promise<void> {
  assertSeedAnchorNotFuture(process.env[SEED_ANCHOR_DATE_ENV])
  await assertNoLeftoverCommentPartitions()
  await assertNoLeftoverHackerNewsScalePartitions()
}
