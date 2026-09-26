import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ClassifierDecisionScope,
  PersistedClassifierDecision,
  PersistedClassifierDecisionResult,
} from './types.mts'

type ResultRow = {
  id: string
  batch_id: string
  decision_call_id: string
  classifier_id: string
  prompt_version_id: string
  probability: number
  effective_lower_threshold: number
  effective_upper_threshold: number
  raw_response: unknown
  scope_category: ClassifierDecisionScope['scopeCategory']
  scope_community_id: string | null
  candidate_id: string | null
  threshold_id: string | null
}

export async function readResults(
  query: QueryExecutor,
  batchId: string,
  candidateKind: 'topic' | 'story',
): Promise<PersistedClassifierDecision['results']> {
  return candidateKind === 'topic'
    ? readTopicResults(query, batchId)
    : readStoryResults(query, batchId)
}

async function readTopicResults(
  query: QueryExecutor,
  batchId: string,
): Promise<PersistedClassifierDecision['results']> {
  const { rows } = await query<ResultRow & { entity_id: string }>(sql`
    /* readCompleteTopicClassifierDecisionResults */
    SELECT id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
      prompt_version_id, probability::float8 AS probability,
      effective_lower_threshold::float8 AS effective_lower_threshold,
      effective_upper_threshold::float8 AS effective_upper_threshold, raw_response,
      scope_category, scope_community_id, topic_id AS entity_id
    FROM topic_classifier_results
    WHERE batch_id = ${batchId}
    ORDER BY topic_id
  `)
  return rows.map(row => toPersistedResult(row, 'topic'))
}

async function readStoryResults(
  query: QueryExecutor,
  batchId: string,
): Promise<PersistedClassifierDecision['results']> {
  const { rows } = await query<ResultRow & { entity_id: string }>(sql`
    /* readCompleteStoryClassifierDecisionResults */
    SELECT id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
      prompt_version_id, probability::float8 AS probability,
      effective_lower_threshold::float8 AS effective_lower_threshold,
      effective_upper_threshold::float8 AS effective_upper_threshold, raw_response,
      scope_category, scope_community_id, story_id AS entity_id
    FROM story_classifier_results
    WHERE batch_id = ${batchId}
    ORDER BY story_id
  `)
  return rows.map(row => toPersistedResult(row, 'story'))
}

function toPersistedResult(
  row: ResultRow & { entity_id?: string },
  candidateKind: 'topic' | 'story',
): PersistedClassifierDecisionResult {
  const entityId = row.entity_id
  if (!entityId) throw new Error('Classifier result did not return its concrete candidate entity')
  const shared = {
    id: row.id,
    batchId: row.batch_id,
    decisionCallId: row.decision_call_id,
    classifierId: row.classifier_id,
    promptVersionId: row.prompt_version_id,
    storedCandidateId: row.candidate_id,
    thresholdId: row.threshold_id,
    probability: row.probability,
    effectiveThresholds: {
      lower: row.effective_lower_threshold,
      upper: row.effective_upper_threshold,
    },
    rawResponse: row.raw_response,
    scope: toScope(row.scope_category, row.scope_community_id),
  }
  return candidateKind === 'topic'
    ? { ...shared, candidateKind, topicId: entityId }
    : { ...shared, candidateKind, storyId: entityId }
}

export function toScope(
  scopeCategory: ClassifierDecisionScope['scopeCategory'],
  scopeCommunityId: string | null,
): ClassifierDecisionScope {
  if (scopeCategory === 'global' && scopeCommunityId === null)
    return { scopeCategory, scopeCommunityId }
  if (scopeCategory === 'community_ai' && scopeCommunityId)
    return { scopeCategory, scopeCommunityId }
  throw new Error('Classifier decision contains an invalid persisted scope')
}
