import sql from 'sql-template-strings'
import type { NormalizedClassifierDecisionInput } from './decision-input.mts'

export type PersistedInputRow = {
  candidateId: string | null
  decisionCallId: string | undefined
  entityId: string
  probability: number
  rawResponse: string
  thresholdId: string | null
  lowerThreshold: number
  upperThreshold: number
}

export function buildTopicInsert(
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
) {
  const values = buildColumnArrays(rows)
  return sql`/* insertTopicClassifierDecisionResults */
    INSERT INTO topic_classifier_results (
      topic_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
      prompt_version_id, probability, effective_lower_threshold, effective_upper_threshold,
      raw_response, scope_category, scope_community_id
    )
    SELECT topic_id, ${input.batchId}, decision_call_id, ${input.classifierId}, candidate_id,
      threshold_id, ${input.promptVersionId}, probability, lower_threshold, upper_threshold,
      raw_response::jsonb, ${input.scope.scopeCategory}, ${input.scope.scopeCommunityId}
    FROM unnest(
      ${values.entityIds}::uuid[], ${values.callIds}::uuid[], ${values.candidateIds}::uuid[],
      ${values.thresholdIds}::uuid[], ${values.probabilities}::numeric[],
      ${values.lowerThresholds}::numeric[], ${values.upperThresholds}::numeric[],
      ${values.rawResponses}::text[]
    ) AS values(
      topic_id, decision_call_id, candidate_id, threshold_id, probability, lower_threshold,
      upper_threshold, raw_response
    )`
}

export function buildStoryInsert(
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
) {
  const values = buildColumnArrays(rows)
  return sql`/* insertStoryClassifierDecisionResults */
    INSERT INTO story_classifier_results (
      story_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
      prompt_version_id, probability, effective_lower_threshold, effective_upper_threshold,
      raw_response, scope_category, scope_community_id
    )
    SELECT story_id, ${input.batchId}, decision_call_id, ${input.classifierId}, candidate_id,
      threshold_id, ${input.promptVersionId}, probability, lower_threshold, upper_threshold,
      raw_response::jsonb, ${input.scope.scopeCategory}, ${input.scope.scopeCommunityId}
    FROM unnest(
      ${values.entityIds}::uuid[], ${values.callIds}::uuid[], ${values.candidateIds}::uuid[],
      ${values.thresholdIds}::uuid[], ${values.probabilities}::numeric[],
      ${values.lowerThresholds}::numeric[], ${values.upperThresholds}::numeric[],
      ${values.rawResponses}::text[]
    ) AS values(
      story_id, decision_call_id, candidate_id, threshold_id, probability, lower_threshold,
      upper_threshold, raw_response
    )`
}

export function buildRssFeedItemInsert(
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
) {
  const values = buildColumnArrays(rows)
  return sql`/* insertRssFeedItemClassifierDecisionResults */
    INSERT INTO rss_feed_item_classifier_results (
      rss_feed_item_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
      prompt_version_id, probability, effective_lower_threshold, effective_upper_threshold,
      raw_response, scope_category, scope_community_id
    )
    SELECT rss_feed_item_id, ${input.batchId}, decision_call_id, ${input.classifierId},
      candidate_id, threshold_id, ${input.promptVersionId}, probability, lower_threshold,
      upper_threshold, raw_response::jsonb, ${input.scope.scopeCategory},
      ${input.scope.scopeCommunityId}
    FROM unnest(
      ${values.entityIds}::uuid[], ${values.callIds}::uuid[], ${values.candidateIds}::uuid[],
      ${values.thresholdIds}::uuid[], ${values.probabilities}::numeric[],
      ${values.lowerThresholds}::numeric[], ${values.upperThresholds}::numeric[],
      ${values.rawResponses}::text[]
    ) AS values(
      rss_feed_item_id, decision_call_id, candidate_id, threshold_id, probability, lower_threshold,
      upper_threshold, raw_response
    )`
}

function buildColumnArrays(rows: readonly PersistedInputRow[]) {
  return {
    entityIds: rows.map(row => row.entityId),
    callIds: rows.map(row => row.decisionCallId!),
    candidateIds: rows.map(row => row.candidateId),
    thresholdIds: rows.map(row => row.thresholdId),
    probabilities: rows.map(row => row.probability),
    lowerThresholds: rows.map(row => row.lowerThreshold),
    upperThresholds: rows.map(row => row.upperThreshold),
    rawResponses: rows.map(row => row.rawResponse),
  }
}
