import { write } from '@data-stores/psql'
import { searchPendingPosts } from '@services/communities/publications/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  contentHash,
  postSeedTimestampMs,
  seedUuid,
  seedUuidAtTimestamp,
} from '../seed-data/common.mts'

const APPROVED_COUNT = 2_000
const PENDING_COUNT = 5

function pendingDensityPostId(index: number): string {
  return seedUuidAtTimestamp(postSeedTimestampMs(0) + (index + 1) * 1000, 800_000 + index)
}

/** Many approved reviews and a handful of pending ones, so the keyset cannot walk the approved index. */
export async function runPendingReviewDensityScenario(): Promise<void> {
  const communityId = seedUuid(80_000, '22')
  const authorId = seedUuid(0, '01')
  const postIds = Array.from({ length: APPROVED_COUNT + PENDING_COUNT }, (_, index) =>
    pendingDensityPostId(index),
  )
  const hash = contentHash('pending-review-density')
  await write(
    `/* seedExplainPendingDensityCommunity */ INSERT INTO communities
       (id, name, slug, created_by_id, created_via)
     VALUES ($1, 'Explain pending density', 'explain-pending-density', $2, 'system')
     ON CONFLICT DO NOTHING`,
    [communityId, authorId],
  )
  await write(
    `/* seedExplainPendingDensityPosts */ INSERT INTO posts
       (id, created_via, post_type, title, markdown, created_by_id, community_id,
        gemini_embedding_2_content_sha256, llm_moderation_content_sha256)
     SELECT input.id, 'system', 'discussion', 'Pending density ' || input.ordinal,
       'Approved reviews must not sit in the pending keyset', $2, $3, $4, $4
     FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [postIds, authorId, communityId, hash],
  )
  await write(
    `/* seedExplainPendingDensityReviews */ INSERT INTO community_post_reviews
       (community_id, post_id, submitted_by_id, reviewed_at, approved_at)
     SELECT $1, input.id, $2,
       CASE WHEN input.ordinal <= $4 THEN CURRENT_TIMESTAMP END,
       CASE WHEN input.ordinal <= $4 THEN CURRENT_TIMESTAMP END
     FROM unnest($3::uuid[]) WITH ORDINALITY AS input(id, ordinal)
     ON CONFLICT (post_id) DO NOTHING`,
    [communityId, authorId, postIds, APPROVED_COUNT],
  )
  await write(`/* analyzeExplainPendingDensity */ ANALYZE community_post_reviews, posts`)
  try {
    registerScenarioContract('search-pending-posts-dense-approved', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_comm_post_reviews__pending'] },
        { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 40 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 200 },
      ],
      crossPartition: {
        posts: 'Pending review hydration looks up each inspected post id across post partitions.',
      },
    })
    await runAndCapture('search-pending-posts-dense-approved', () =>
      searchPendingPosts(communityId, { limit: 25 }),
    )
  } finally {
    await write(`/* deleteExplainPendingDensity */ DELETE FROM posts WHERE id = ANY($1::uuid[])`, [
      postIds,
    ])
    await write(
      `/* deleteExplainPendingDensityCommunity */ DELETE FROM communities WHERE id = $1`,
      [communityId],
    )
  }
}
