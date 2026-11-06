import { read, write } from '@data-stores/psql'
import { getLandingPageCandidateIds } from '@services/my/landing-pages/candidate-ids'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { contentHash, postSeedTimestampMs, seedUuidAtTimestamp } from '../seed-data/common.mts'
import { LANDING_PAGE_REVIEW_OWNER_ID } from '../seed-data/landing-page-candidates.mts'

const OTHER_POST_COUNT = 2_000

function newerDiscussionId(index: number): string {
  return seedUuidAtTimestamp(postSeedTimestampMs(0) + (index + 1) * 60_000, 810_000 + index)
}

async function reviewAuthorIndexLeaves(): Promise<string[]> {
  const { rows } = await read<{ index_name: string }>(
    `/* landingPageReviewAuthorIndexes */
     SELECT index_class.relname AS index_name
     FROM pg_partition_tree('idx_posts__created_by_id__review'::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf`,
  )
  if (rows.length === 0) throw new Error('Landing review plans need the review author index')
  return rows.map(row => row.index_name)
}

/** Newer non-review posts by the heavy author must stay outside the review candidate page. */
export async function runLandingPageReviewTypeScenario(): Promise<void> {
  const postIds = Array.from({ length: OTHER_POST_COUNT }, (_, index) => newerDiscussionId(index))
  const hash = contentHash('landing-review-type-page')
  await write(
    `/* seedExplainLandingOtherPosts */ INSERT INTO posts
       (id, created_via, post_type, title, markdown, created_by_id,
        bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     SELECT input.id, 'system', 'discussion', 'Landing other post ' || input.ordinal,
       'Non-review posts must not enter the review candidate index', $2, $3, $3
     FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [postIds, LANDING_PAGE_REVIEW_OWNER_ID, hash],
  )
  await write(`/* analyzeExplainLandingOtherPosts */ ANALYZE posts`)
  try {
    const reviewIndexes = await reviewAuthorIndexLeaves()
    registerScenarioContract('landing-page-candidates-among-other-posts', {
      expectations: [
        { kind: 'usesIndexes', indexes: reviewIndexes, anyOf: true },
        { kind: 'maxProcessedRows', relation: 'posts', max: 407 },
      ],
      crossPartition: {
        posts: 'Owned reviews span post-id ranges; the review author index skips other post types.',
      },
    })
    await runAndCapture('landing-page-candidates-among-other-posts', async () => {
      const page = await getLandingPageCandidateIds(LANDING_PAGE_REVIEW_OWNER_ID, 101, null)
      if (page.length !== 101 || page.some(row => row.tier !== 1))
        throw new Error('Review candidates must ignore newer non-review posts')
    })
  } finally {
    await write(
      `/* deleteExplainLandingOtherPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])`,
      [postIds],
    )
  }
}
