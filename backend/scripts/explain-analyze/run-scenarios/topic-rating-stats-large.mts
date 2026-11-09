import { write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture } from '../run-support.mts'
import { updateTopicRatingStats } from '../run-services.mts'
import {
  LARGE_RATING_TOPIC_ID,
  LARGE_RATING_TOPIC_REVIEWERS,
  LARGE_RATING_TOPIC_REVIEW_ROWS,
  LARGE_RATING_TOPIC_VOTE_ROWS,
  seedLargeRatingTopic,
} from '../seed-data/topic-rating-stats-large.mts'

// The live recompute re-reads a topic's whole rating history, so its cost scales with the most
// reviewed topic. The ordinary seed spreads ratings over 2,500 topics; this popular topic gives
// calculateTopicRatingStats thousands of reviewers and voters (with ballot history) to walk.
export async function runLargeTopicRatingStatsScenario(): Promise<void> {
  await seedLargeRatingTopic()
  registerScenarioContract('topic-rating-stats-large', {
    // No row gates: the planner may seq scan these small partitions several times per plan, so a
    // processed-row ceiling would pin planner choice. The scenario captures the plan and verifies
    // the recompute result on a large topic.
    expectations: [],
    seededRows: {
      post_review_topic_ratings:
        (SEEDED_ROWS_BY_RELATION.post_review_topic_ratings ?? 0) + LARGE_RATING_TOPIC_REVIEW_ROWS,
      topic_votes: (SEEDED_ROWS_BY_RELATION.topic_votes ?? 0) + LARGE_RATING_TOPIC_VOTE_ROWS,
    },
  })
  await runAndCapture('topic-rating-stats-large', () =>
    updateTopicRatingStats(LARGE_RATING_TOPIC_ID),
  )
  const { rows } = await write<{ reviews: string }>(
    `/* verifyLargeTopicRatingStats */ SELECT (ratings__count__1 + ratings__count__2 + ratings__count__3
         + ratings__count__4 + ratings__count__5)::text AS reviews
       FROM topic_metrics WHERE topic_id = $1`,
    [LARGE_RATING_TOPIC_ID],
  )
  if (Number(rows[0]?.reviews) !== LARGE_RATING_TOPIC_REVIEWERS) {
    throw new Error(
      `Large topic rating stats counted ${rows[0]?.reviews} reviewers; expected ${LARGE_RATING_TOPIC_REVIEWERS}`,
    )
  }
}
