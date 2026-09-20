import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

type BatchOptions = { communityId?: string; shardOrdinal?: number }
type ResultOptions = {
  batchId: string
  callId: string
  candidateId?: string | null
  thresholdId?: string | null
  effectiveLower?: number
  topicId?: string
  communityId?: string
}

export function buildClassifierFixtureOperations(data: ClassifierFixtureData) {
  async function createAdditionalCall(batchId: string, shardOrdinal: number): Promise<string> {
    const { rows } = await write<{ id: string }>(sql`
      /* createClassifierFixtureCall */
      INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
      VALUES (${batchId}, ${shardOrdinal}) RETURNING id
    `)
    return rows[0]!.id
  }

  async function createTopicBatch(options: BatchOptions = {}) {
    const scopeCategory = options.communityId ? 'community_ai' : 'global'
    const { rows } = await write<{ id: string }>(sql`
      /* createClassifierFixtureTopicBatch */
      INSERT INTO classifier_decision_batches (
        classifier_id, prompt_version_id, post_id, scope_category, scope_community_id
      ) VALUES (
        ${data.classifierId}, ${data.promptVersionId}, ${data.postId}, ${scopeCategory},
        ${options.communityId ?? null}
      ) RETURNING id
    `)
    const batchId = rows[0]!.id
    return {
      batchId,
      callId: await createAdditionalCall(batchId, options.shardOrdinal ?? 0),
    }
  }

  async function createStoryBatch() {
    const { rows } = await write<{ id: string }>(sql`
      /* createClassifierFixtureStoryBatch */
      INSERT INTO classifier_decision_batches (
        classifier_id, prompt_version_id, rss_feed_item_id, scope_category
      ) VALUES (
        ${data.storyClassifierId}, ${data.storyPromptVersionId}, ${data.rssFeedItemId}, 'global'
      ) RETURNING id
    `)
    const batchId = rows[0]!.id
    return { batchId, callId: await createAdditionalCall(batchId, 0) }
  }

  function insertTopicResult(options: ResultOptions) {
    const scopeCategory = options.communityId ? 'community_ai' : 'global'
    const usesCommunityThreshold = options.candidateId === data.communityCandidateId
    const effectiveLower = options.effectiveLower ?? (usesCommunityThreshold ? 0.3 : 0.25)
    const thresholdId =
      options.thresholdId === undefined
        ? usesCommunityThreshold
          ? data.communityThresholdId
          : null
        : options.thresholdId
    return write(sql`
      /* insertClassifierFixtureTopicResult */
      INSERT INTO topic_classifier_results (
        topic_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
        prompt_version_id,
        probability, effective_lower_threshold, effective_upper_threshold,
        raw_response, scope_category, scope_community_id
      ) VALUES (
        ${options.topicId ?? data.topicId}, ${options.batchId}, ${options.callId},
        ${data.classifierId},
        ${options.candidateId === undefined ? data.topicCandidateId : options.candidateId},
        ${thresholdId}, ${data.promptVersionId}, 0.5000, ${effectiveLower}, 0.7500,
        '{"type":"noul","noul":0.5}'::jsonb,
        ${scopeCategory}, ${options.communityId ?? null}
      )
    `)
  }

  function insertStoryResult(batchId: string, callId: string) {
    return write(sql`/* insertClassifierFixtureStoryResult */
      INSERT INTO story_classifier_results (
        story_id, batch_id, decision_call_id, classifier_id, candidate_id, prompt_version_id,
        probability, effective_lower_threshold, effective_upper_threshold,
        raw_response, scope_category
      ) VALUES (
        ${data.storyId}, ${batchId}, ${callId}, ${data.storyClassifierId},
        ${data.storyCandidateId}, ${data.storyPromptVersionId}, 0.8000, 0.2500, 0.7500,
        '{"type":"choice","choice":"story"}'::jsonb, 'global'
      )`)
  }

  return {
    rejectCrossKindCandidate: () =>
      write(sql`/* rejectClassifierFixtureCrossKindCandidate */
        INSERT INTO classifier_candidates (classifier_id, candidate_kind, story_id)
        VALUES (${data.classifierId}, 'story', ${data.storyId})`),
    rejectBothEntityCandidate: () =>
      write(sql`/* rejectClassifierFixtureBothEntityCandidate */
        INSERT INTO classifier_candidates (classifier_id, candidate_kind, topic_id, story_id)
        VALUES (${data.classifierId}, 'topic', ${data.topicId}, ${data.storyId})`),
    rejectNoEntityCandidate: () =>
      write(sql`/* rejectClassifierFixtureNoEntityCandidate */
        INSERT INTO classifier_candidates (classifier_id, candidate_kind)
        VALUES (${data.classifierId}, 'topic')`),
    rejectDuplicateCandidate: () =>
      write(sql`/* rejectClassifierFixtureDuplicateCandidate */
        INSERT INTO classifier_candidates (classifier_id, candidate_kind, topic_id)
        VALUES (${data.classifierId}, 'topic', ${data.topicId})`),
    rejectPromptIdentityMutation: () =>
      write(sql`/* rejectClassifierFixturePromptIdentityMutation */
        UPDATE classifier_prompt_versions SET prompt = 'changed'
        WHERE id = ${data.promptVersionId}`),
    activatePrompt: () =>
      write(sql`/* activateClassifierFixturePrompt */
        UPDATE classifier_prompt_versions SET activated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.promptVersionId}`),
    enableGlobalCandidateForCommunity: () =>
      write(sql`/* enableClassifierFixtureGlobalCandidate */
        INSERT INTO classifier_candidate_community_overrides (community_id, candidate_id)
        VALUES (${data.communityId}, ${data.topicCandidateId})`),
    rejectCommunityOverrideForLocalCandidate: () =>
      write(sql`/* rejectClassifierFixtureLocalCandidateOverride */
        INSERT INTO classifier_candidate_community_overrides (community_id, candidate_id)
        VALUES (${data.communityId}, ${data.communityCandidateId})`),
    createTopicBatch,
    createStoryBatch,
    createAdditionalCall,
    insertTopicResult,
    insertStoryResult,
    rejectResultScopeMismatch: (batchId: string, callId: string) =>
      write(sql`/* rejectClassifierFixtureResultScopeMismatch */
        INSERT INTO topic_classifier_results (
          topic_id, batch_id, decision_call_id, classifier_id, candidate_id, prompt_version_id,
          probability, effective_lower_threshold, effective_upper_threshold,
          raw_response, scope_category, scope_community_id
        ) VALUES (
          ${data.topicId}, ${batchId}, ${callId}, ${data.classifierId}, ${data.topicCandidateId},
          ${data.promptVersionId}, 0.5000, 0.2500, 0.7500,
          '{}'::jsonb, 'community_ai', ${data.communityId}
        )`),
    rejectResultThresholdMismatch: (batchId: string, callId: string) =>
      write(sql`/* rejectClassifierFixtureResultThresholdMismatch */
        INSERT INTO topic_classifier_results (
          topic_id, batch_id, decision_call_id, classifier_id, candidate_id, prompt_version_id,
          probability, effective_lower_threshold, effective_upper_threshold,
          raw_response, scope_category
        ) VALUES (
          ${data.topicId}, ${batchId}, ${callId}, ${data.classifierId}, ${data.topicCandidateId},
          ${data.promptVersionId}, 0.5000, 0.2000, 0.7500, '{}'::jsonb, 'global'
        )`),
    rejectBatchMutation: (batchId: string) =>
      write(sql`/* rejectClassifierFixtureBatchMutation */
        UPDATE classifier_decision_batches SET scope_category = 'community_ai',
          scope_community_id = ${data.communityId} WHERE id = ${batchId}`),
    rejectClassifierIdentityMutation: () =>
      write(sql`/* rejectClassifierFixtureIdentityMutation */
        UPDATE classifiers SET candidate_kind = 'story' WHERE id = ${data.classifierId}`),
    rejectTopicClassifierStoryResult: (batchId: string, callId: string) =>
      write(sql`/* rejectTopicClassifierStoryResult */
        INSERT INTO story_classifier_results (
          story_id, batch_id, decision_call_id, classifier_id, candidate_id, prompt_version_id,
          probability, effective_lower_threshold, effective_upper_threshold,
          raw_response, scope_category
        ) VALUES (
          ${data.storyId}, ${batchId}, ${callId}, ${data.classifierId}, NULL,
          ${data.promptVersionId}, 0.5, 0.25, 0.75, '{}'::jsonb, 'global'
        )`),
    deleteBatch: (batchId: string) =>
      write(sql`/* deleteClassifierFixtureBatch */
        DELETE FROM classifier_decision_batches WHERE id = ${batchId}`),
    deleteCall: (callId: string) =>
      write(sql`/* deleteClassifierFixtureCall */
        DELETE FROM classifier_decision_calls WHERE id = ${callId}`),
    deleteCandidate: (candidateId: string) =>
      write(sql`/* deleteClassifierFixtureCandidate */
        DELETE FROM classifier_candidates WHERE id = ${candidateId}`),
    deleteCommunity: () =>
      write(sql`/* deleteClassifierFixtureCommunity */
        DELETE FROM communities WHERE id = ${data.communityId}`),
    deletePost: () =>
      write(sql`/* deleteClassifierFixturePost */ DELETE FROM posts WHERE id = ${data.postId}`),
  }
}
