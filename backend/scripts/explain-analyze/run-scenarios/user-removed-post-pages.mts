import { write } from '@data-stores/psql'
import { listUserRemovedPosts } from '../run-services.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runRemovalEligiblePageScenarios } from './removal-eligible-pages.mts'

const REMOVED_COUNT = 2_000
const PAGE_SIZE = 25
const LOOKAHEAD = PAGE_SIZE + 1

/** Compare the eligible event streams without reading the full author cohort. */
export async function runUserRemovedPostPageScenarios(): Promise<void> {
  const userId = seedUser.id
  const postIds = Array.from({ length: REMOVED_COUNT }, (_, index) => seedUuid(index, '18'))
  await write(
    `/* seedExplainCommunityRemovals */ INSERT INTO community_post_reviews
       (community_id, post_id, submitted_by_id, unpublished_at)
     SELECT $1, input.post_id, $2, CURRENT_TIMESTAMP - make_interval(secs => input.ordinal::double precision)
     FROM unnest($3::uuid[]) WITH ORDINALITY AS input(post_id, ordinal)
     ON CONFLICT (post_id) DO NOTHING`,
    [seedUuid(0, '14'), userId, postIds],
  )
  await write(`/* analyzeExplainCommunityRemovals */ ANALYZE community_post_reviews`)
  try {
    registerScenarioContract('user-removed-community-posts-page', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_comm_post_reviews__user_removed'] },
        { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: LOOKAHEAD * 2 },
        { kind: 'maxProcessedRows', relation: 'posts', max: LOOKAHEAD * 3 },
      ],
    })
    await runAndCapture('user-removed-community-posts-page', () =>
      listUserRemovedPosts(userId, { includePlatform: false, limit: PAGE_SIZE }),
    )
    registerScenarioContract('user-removed-posts-page', {
      expectations: [
        { kind: 'custom', name: 'userRemovedPosts' },
        {
          kind: 'usesIndexes',
          indexes: [
            'idx_posts__default__created_by_rejected_at_id',
            'idx_comm_post_reviews__user_removed',
          ],
        },
        { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: LOOKAHEAD * 2 },
      ],
    })
    await runAndCapture('user-removed-posts-page', () =>
      listUserRemovedPosts(userId, { includePlatform: true, limit: PAGE_SIZE }),
    )
  } finally {
    await write(
      `/* deleteExplainCommunityRemovals */ DELETE FROM community_post_reviews WHERE post_id = ANY($1::uuid[])`,
      [postIds],
    )
  }
  await runRemovalEligiblePageScenarios()
}
