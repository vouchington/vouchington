import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ClassifierFixtureData } from '../classifier-fixture-data.mts'

type StoryResultFixture = Pick<
  ClassifierFixtureData,
  'storyClassifierId' | 'storyCandidateId' | 'storyThresholdId' | 'storyPromptVersionId'
>

/** One story-family result row; each target is the entity the row scores, or null. */
export function insertStoryFamilyResultForTest(
  fixture: StoryResultFixture,
  lineage: { batchId: string; callId: string },
  target: { storyId: string | null; rssFeedItemId: string | null; stored: boolean },
) {
  return write(sql`/* insertStoryFamilyResultForTest */
    INSERT INTO story_classifier_results (
      story_id, rss_feed_item_id, batch_id, decision_call_id, classifier_id, candidate_id,
      threshold_id, prompt_version_id, probability, effective_lower_threshold,
      effective_upper_threshold, raw_response, scope_category
    ) VALUES (
      ${target.storyId}, ${target.rssFeedItemId}, ${lineage.batchId}, ${lineage.callId},
      ${fixture.storyClassifierId},
      ${target.stored ? fixture.storyCandidateId : null},
      ${target.stored ? fixture.storyThresholdId : null},
      ${fixture.storyPromptVersionId}, 0.8, 0.2500, 0.7500, '{}'::jsonb, 'global'
    ) RETURNING probability::text`)
}

/** One captured run candidate; the columns name the entity it points at, or none. */
export function insertRunCandidateForTest(
  runId: string,
  columns: { story: string | null; item: string | null; topic?: string | null },
  ordinal: number,
) {
  const topic = columns.topic === undefined ? null : columns.topic
  return write(sql`/* insertRunCandidateForTest */
    INSERT INTO classifier_run_candidates (run_id, story_id, rss_feed_item_id, topic_id, ordinal)
    VALUES (${runId}, ${columns.story}, ${columns.item}, ${topic}, ${ordinal})`)
}
