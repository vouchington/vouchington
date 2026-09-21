import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  classifierDecisionCandidateKind,
  flattenClassifierDecisionResults,
  type NormalizedClassifierDecisionInput,
} from './decision-input.mts'
import type { PersistedClassifierDecisionCall } from './types.mts'

type PromptThresholdRow = {
  candidate_kind: 'topic' | 'story'
  default_lower_threshold: number
  default_upper_threshold: number
}

export type ClassifierDecisionConfiguration = {
  candidateKind: 'topic' | 'story'
  thresholds: { lower: number; upper: number }
}

type SnapshotRow = {
  candidate_id: string
  threshold_id: string
  effective_lower_threshold: number
  effective_upper_threshold: number
}

type CallRow = { id: string; shard_ordinal: number }

export async function insertClassifierDecisionBatch(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
): Promise<boolean> {
  const { rowCount } = await query(sql`
    /* insertClassifierDecisionBatch */
    INSERT INTO classifier_decision_batches (
      id, classifier_id, prompt_version_id, post_id, rss_feed_item_id, scope_category,
      scope_community_id
    ) VALUES (
      ${input.batchId}, ${input.classifierId}, ${input.promptVersionId}, ${input.subject.postId},
      ${input.subject.rssFeedItemId}, ${input.scope.scopeCategory}, ${input.scope.scopeCommunityId}
    ) ON CONFLICT (id) DO NOTHING
  `)
  return rowCount === 1
}

export async function loadClassifierDecisionPromptThresholds(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
): Promise<ClassifierDecisionConfiguration> {
  const { rows } = await query<PromptThresholdRow>(sql`
    /* loadClassifierDecisionPromptThresholds */
    SELECT classifier.candidate_kind,
      prompt.default_lower_threshold::float8 AS default_lower_threshold,
      prompt.default_upper_threshold::float8 AS default_upper_threshold
    FROM classifier_prompt_versions prompt
    JOIN classifiers classifier ON classifier.id = prompt.classifier_id
    WHERE prompt.id = ${input.promptVersionId} AND prompt.classifier_id = ${input.classifierId}
      AND classifier.activated_at IS NOT NULL
      AND classifier.deactivated_at IS NULL
      AND classifier.deleted_at IS NULL
      AND prompt.activated_at IS NOT NULL
      AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL
    FOR SHARE OF classifier, prompt
  `)
  const row = rows[0]
  if (!row) throw new Error('Classifier prompt version is not active for its classifier')
  return {
    candidateKind: row.candidate_kind,
    thresholds: { lower: row.default_lower_threshold, upper: row.default_upper_threshold },
  }
}

export async function captureClassifierDecisionStoredCandidateSnapshots(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
): Promise<ReadonlyMap<string, SnapshotRow>> {
  const storedCandidateIds = flattenClassifierDecisionResults(input).flatMap(result =>
    result.storedCandidateId ? [result.storedCandidateId] : [],
  )
  if (storedCandidateIds.length === 0) return new Map()
  const { rows } = await query<SnapshotRow>(sql`
    /* captureClassifierDecisionStoredCandidateSnapshots */
    WITH requested_candidate_ids AS (
      SELECT unnest(${storedCandidateIds}::uuid[]) AS candidate_id
    )
    INSERT INTO classifier_decision_batch_candidates (
      batch_id, classifier_id, candidate_id, prompt_version_id, threshold_id,
      effective_lower_threshold, effective_upper_threshold
    )
    SELECT ${input.batchId}, ${input.classifierId}, candidate.id, ${input.promptVersionId}, threshold.id,
      COALESCE(threshold.lower_threshold_override, prompt.default_lower_threshold),
      COALESCE(threshold.upper_threshold_override, prompt.default_upper_threshold)
    FROM requested_candidate_ids requested
    JOIN classifier_candidates candidate ON candidate.id = requested.candidate_id
    JOIN classifier_prompt_versions prompt
      ON prompt.id = ${input.promptVersionId} AND prompt.classifier_id = ${input.classifierId}
    JOIN classifier_candidate_thresholds threshold
      ON threshold.classifier_id = ${input.classifierId}
      AND threshold.candidate_id = candidate.id
      AND threshold.prompt_version_id = ${input.promptVersionId}
      AND threshold.deactivated_at IS NULL
    WHERE candidate.classifier_id = ${input.classifierId}
      AND candidate.candidate_kind = ${classifierDecisionCandidateKind(input)}
      AND candidate.deleted_at IS NULL
    RETURNING candidate_id, threshold_id,
      effective_lower_threshold::float8 AS effective_lower_threshold,
      effective_upper_threshold::float8 AS effective_upper_threshold
  `)
  if (rows.length !== storedCandidateIds.length) {
    throw new Error(
      'Each stored classifier candidate must have exactly one active threshold revision',
    )
  }
  return new Map(rows.map(row => [row.candidate_id, row]))
}

export async function insertClassifierDecisionCalls(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
): Promise<readonly PersistedClassifierDecisionCall[]> {
  const ordinals = input.calls.map(call => call.shardOrdinal)
  const { rows } = await query<CallRow>(sql`
    /* insertClassifierDecisionCalls */
    INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
    SELECT ${input.batchId}, shard_ordinal
    FROM unnest(${ordinals}::integer[]) AS shard_ordinal
    RETURNING id, shard_ordinal
  `)
  if (rows.length !== input.calls.length) {
    throw new Error('Classifier decision calls were not fully persisted')
  }
  return rows
    .map(row => ({ id: row.id, shardOrdinal: row.shard_ordinal }))
    .sort((left, right) => left.shardOrdinal - right.shardOrdinal)
}

export type ClassifierDecisionSnapshot = SnapshotRow
