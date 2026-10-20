import { read } from '@data-stores/psql'
import { seedPostId } from './run-support.mts'
import { SEED_ANCHOR_DATE_ENV } from './seed-data/seed-anchor.mts'

// Both processes need the same seed anchor; a UTC rollover can make a derived post id miss.
// Zero-row SQL still counts as captured, so verify the seeded anchor before profiling.
export async function assertSeedAnchorMatches(postId: string = seedPostId): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* explainAnalyzeAssertSeedAnchor */ SELECT id FROM posts WHERE id = $1`,
    [postId],
  )
  if (rows.length === 0) {
    const pinnedDay = process.env.EXPLAIN_SEED_ANCHOR_DATE
    const anchorSource =
      pinnedDay === undefined
        ? `${SEED_ANCHOR_DATE_ENV} is unset, so a UTC midnight between the two process runs splits them`
        : `${SEED_ANCHOR_DATE_ENV}=${pinnedDay} here; the seed step must have been given the same day`
    throw new Error(
      `Seed anchor post ${postId} not found. seed.mts and run.mts derived different day ` +
        `anchors (${anchorSource}), or the seed step did not complete.`,
    )
  }
}
