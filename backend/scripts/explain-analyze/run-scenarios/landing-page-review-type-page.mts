import { write } from '@data-stores/psql'
import { getLandingPageCandidateIds } from '@services/my/landing-pages/candidate-ids'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { contentHash, postSeedTimestampMs, seedUuidAtTimestamp } from '../seed-data/common.mts'
import { LANDING_PAGE_REVIEW_OWNER_ID } from '../seed-data/landing-page-candidates.mts'

const OTHER_POST_COUNT = 2_000

function newerDiscussionId(index: number): string {
  return seedUuidAtTimestamp(postSeedTimestampMs(0) + (index + 1) * 1000, 810_000 + index)
}

/** Newer non-review posts by the heavy author must stay outside the review candidate page. */
export async function runLandingPageReviewTypeScenario(): Promise<void> {
  const postIds = Array.from({ length: OTHER_POST_COUNT }, (_, index) => newerDiscussionId(index))
  const hash = contentHash('landing-review-type-page')
  await write(
    `/* seedExplainLandingOtherPosts */ INSERT INTO posts
       (id, created_via, post_type, title, markdown, created_by_id,
        gemini_embedding_2_content_sha256, llm_moderation_content_sha256)
     SELECT input.id, 'system', 'discussion', 'Landing other post ' || input.ordinal,
       'Non-review posts must not enter the review candidate index', $2, $3, $3
     FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [postIds, LANDING_PAGE_REVIEW_OWNER_ID, hash],
  )
  await write(`/* analyzeExplainLandingOtherPosts */ ANALYZE posts`)
  try {
    registerScenarioContract('landing-page-candidates-among-other-posts', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_user_landing_page_candidates__user_order'] },
        { kind: 'maxProcessedRows', relation: 'user_landing_page_candidates', max: 150 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 407 },
      ],
      seededRows: { user_landing_page_candidates: 12_000 },
      crossPartition: {
        posts:
          'Candidate review ids can span post-id ranges; source eligibility is checked by post id.',
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
