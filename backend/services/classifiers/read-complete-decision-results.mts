import type { QueryExecutor } from '@data-stores/psql'
import type { ClassifierCandidateKind } from '@voucha/types'
import sql from 'sql-template-strings'
import type {
  ClassifierDecisionInputResult,
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
  candidateKind: ClassifierCandidateKind,
): Promise<PersistedClassifierDecision['results']> {
  switch (candidateKind) {
    case 'topic':
      return readTopicResults(query, batchId)
    case 'story':
      return readStoryResults(query, batchId)
    case 'community_prompt':
      return readCommunityPromptResults(query, batchId)
  }
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
  const { rows } = await query<
    ResultRow & { story_id: string | null; rss_feed_item_id: string | null }
  >(sql`
    /* readCompleteStoryClassifierDecisionResults */
    SELECT id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
      prompt_version_id, probability::float8 AS probability,
      effective_lower_threshold::float8 AS effective_lower_threshold,
      effective_upper_threshold::float8 AS effective_upper_threshold, raw_response,
      scope_category, scope_community_id, story_id, rss_feed_item_id
    FROM story_classifier_results
    WHERE batch_id = ${batchId}
    ORDER BY story_id NULLS LAST, rss_feed_item_id
  `)
  return rows.map(row => {
    if (row.story_id) return toPersistedResult({ ...row, entity_id: row.story_id }, 'story')
    return toPersistedResult(
      { ...row, entity_id: row.rss_feed_item_id ?? undefined },
      'rss_feed_item',
    )
  })
}

async function readCommunityPromptResults(
  query: QueryExecutor,
  batchId: string,
): Promise<PersistedClassifierDecision['results']> {
  const { rows } = await query<ResultRow & { entity_id: string }>(sql`
    /* readCompleteCommunityPromptClassifierDecisionResults */
    SELECT id, batch_id, decision_call_id, classifier_id, NULL::uuid AS candidate_id,
      NULL::uuid AS threshold_id, prompt_version_id, probability::float8 AS probability,
      effective_lower_threshold::float8 AS effective_lower_threshold,
      effective_upper_threshold::float8 AS effective_upper_threshold, raw_response,
      scope_category, scope_community_id, community_prompt_id AS entity_id
    FROM community_prompt_classifier_results
    WHERE batch_id = ${batchId}
    ORDER BY community_prompt_id
  `)
  return rows.map(row => toPersistedResult(row, 'community_prompt'))
}

function toPersistedResult(
  row: ResultRow & { entity_id?: string },
  candidateKind: ClassifierDecisionInputResult['candidateKind'],
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
  switch (candidateKind) {
    case 'topic':
      return { ...shared, candidateKind, topicId: entityId }
    case 'story':
      return { ...shared, candidateKind, storyId: entityId }
    case 'rss_feed_item': {
      if (row.candidate_id !== null)
        throw new Error('Classifier RSS item result cannot carry a stored candidate')
      return { ...shared, candidateKind, storedCandidateId: null, rssFeedItemId: entityId }
    }
    case 'community_prompt':
      return {
        ...shared,
        candidateKind,
        communityPromptId: entityId,
        storedCandidateId: null,
        thresholdId: null,
      }
  }
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
