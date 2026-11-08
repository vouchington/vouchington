import { getLandingPageCandidateIds } from '@services/my/landing-pages/candidate-ids'
import { getLandingPageReviewsByIds } from '@services/my/landing-pages/item-lookups'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  LANDING_PAGE_REVIEW_CURSOR_INDEX,
  LANDING_PAGE_REVIEW_OWNER_ID,
  landingPageReviewId,
} from '../seed-data/landing-page-candidates.mts'
import { runLandingPageCandidateSourceWriteScenarios } from './landing-page-candidate-source-writes.mts'
import { runLandingPageReviewTypeScenario } from './landing-page-review-type-page.mts'

export async function runLandingPageCandidateScenarios(): Promise<void> {
  const crossPartition = {
    posts:
      'Candidate review ids can span post-id ranges; source eligibility is checked by post id.',
    post_review_topic_ratings:
      'Selected review ids can span post-id ranges; each rating lookup is by post_id.',
  }
  for (const [scenario, cursor] of [
    ['landing-page-candidates-heavy-first', null],
    [
      'landing-page-candidates-heavy-cursor',
      {
        id: landingPageReviewId(LANDING_PAGE_REVIEW_CURSOR_INDEX),
        tier: 1,
        sort_order: null,
      },
    ],
  ] as const) {
    registerScenarioContract(scenario, {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_user_landing_page_candidates__user_order'] },
        { kind: 'maxProcessedRows', relation: 'user_landing_page_candidates', max: 150 },
        // Both plan modes process 338 post rows, including eligibility self-lookups; +20%.
        { kind: 'maxProcessedRows', relation: 'posts', max: 407 },
      ],
      seededRows: { user_landing_page_candidates: 10_000 },
      crossPartition,
    })
    // no-mistakes-disable-next-line query-reached-per-item: two fixed first/cursor scenarios need separate serialized production query captures and plan gates
    await runAndCapture(scenario, async () => {
      const page = await getLandingPageCandidateIds(LANDING_PAGE_REVIEW_OWNER_ID, 101, cursor)
      if (page.length !== 101 || page.some(row => row.tier !== 1))
        throw new Error('Heavy-author candidate fixture must return a full review page')
    })
  }
  // Include both private and unapproved ids: public reads filter them, owner validation retains them.
  const selected = Array.from({ length: 100 }, (_, index) => landingPageReviewId(6_000 + index))
  for (const [scenario, publicOnly] of [
    ['landing-page-reviews-heavy-public', true],
    ['landing-page-reviews-heavy-owner', false],
  ] as const) {
    registerScenarioContract(scenario, {
      // Public lookup: 271 post rows and 160 ratings/slugs. Owner lookup: 100 and 200; +20%.
      expectations: [
        { kind: 'maxProcessedRows', relation: 'posts', max: publicOnly ? 326 : 120 },
        {
          kind: 'maxProcessedRows',
          relation: 'post_review_topic_ratings',
          max: publicOnly ? 192 : 240,
        },
        { kind: 'maxProcessedRows', relation: 'post_slugs', max: publicOnly ? 192 : 240 },
      ],
      crossPartition,
    })
    // no-mistakes-disable-next-line query-reached-per-item: two fixed public/owner scenarios need separate serialized production query captures and plan gates
    await runAndCapture(scenario, async () => {
      const reviews = await getLandingPageReviewsByIds(
        LANDING_PAGE_REVIEW_OWNER_ID,
        selected,
        publicOnly,
      )
      if (reviews.size !== (publicOnly ? 80 : 100))
        throw new Error(
          'Heavy-author review fixture must preserve visibility and ownership results',
        )
    })
  }
  await runLandingPageReviewTypeScenario()
  await runLandingPageCandidateSourceWriteScenarios()
}
