import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  classifierDecisionCandidateKind,
  flattenClassifierDecisionResults,
  serializeClassifierRawResponse,
  type NormalizedClassifierDecisionInput,
} from './decision-input.mts'
import type { ClassifierDecisionSnapshot } from './write-decision-lineage.mts'
import type { ClassifierDecisionInputResult, PersistedClassifierDecisionCall } from './types.mts'

type PersistedInputRow = {
  candidateId: string | null
  decisionCallId: string | undefined
  entityId: string
  probability: number
  rawResponse: string
  thresholdId: string | null
  lowerThreshold: number
  upperThreshold: number
}

export async function insertClassifierDecisionResults(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
  calls: readonly PersistedClassifierDecisionCall[],
  snapshots: ReadonlyMap<string, ClassifierDecisionSnapshot>,
  promptThresholds: { lower: number; upper: number },
): Promise<number> {
  const callIdsByOrdinal = new Map(calls.map(call => [call.shardOrdinal, call.id]))
  const rows = input.calls.flatMap(call =>
    call.results.map(result =>
      toPersistedInputRow(
        result,
        callIdsByOrdinal.get(call.shardOrdinal),
        snapshots,
        promptThresholds,
      ),
    ),
  )
  if (rows.some(row => !row.decisionCallId)) {
    throw new Error('Classifier decision call is missing its persisted shard')
  }
  return classifierDecisionCandidateKind(input) === 'topic'
    ? insertTopicResults(query, input, rows)
    : insertStoryResults(query, input, rows)
}

function toPersistedInputRow(
  result: ClassifierDecisionInputResult,
  decisionCallId: string | undefined,
  snapshots: ReadonlyMap<string, ClassifierDecisionSnapshot>,
  promptThresholds: { lower: number; upper: number },
): PersistedInputRow {
  const snapshot = result.storedCandidateId ? snapshots.get(result.storedCandidateId) : undefined
  return {
    candidateId: result.storedCandidateId,
    decisionCallId,
    entityId: result.candidateKind === 'topic' ? result.topicId : result.storyId,
    probability: result.probability,
    rawResponse: serializeClassifierRawResponse(result.rawResponse),
    thresholdId: snapshot?.threshold_id ?? null,
    lowerThreshold: snapshot?.effective_lower_threshold ?? promptThresholds.lower,
    upperThreshold: snapshot?.effective_upper_threshold ?? promptThresholds.upper,
  }
}

async function insertTopicResults(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
): Promise<number> {
  const { rowCount } = await query(buildTopicInsert(input, rows))
  return rowCount ?? 0
}

async function insertStoryResults(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
): Promise<number> {
  const { rowCount } = await query(buildStoryInsert(input, rows))
  return rowCount ?? 0
}

function buildTopicInsert(
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

function buildStoryInsert(
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

export function expectedClassifierDecisionResultCount(
  input: NormalizedClassifierDecisionInput,
): number {
  return flattenClassifierDecisionResults(input).length
}
