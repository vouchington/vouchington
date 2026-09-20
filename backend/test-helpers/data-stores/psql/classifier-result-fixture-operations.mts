import sql from 'sql-template-strings'
import { beginTransaction, write } from '@data-stores/psql'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

type ResultOptions = {
  batchId: string
  callId: string
  candidateId?: string | null
  thresholdId?: string | null
  effectiveLower?: number
  topicId?: string
  communityId?: string
  probability?: number
}

export function buildClassifierResultFixtureOperations(data: ClassifierFixtureData) {
  return {
    createTopicBatchWithoutSnapshot: async () => {
      const { rows } = await write<{ batch_id: string; call_id: string }>(sql`
        /* createClassifierFixtureTopicBatchWithoutSnapshot */
        WITH batch AS (
          INSERT INTO classifier_decision_batches (
            classifier_id, prompt_version_id, post_id, scope_category
          ) VALUES (${data.classifierId}, ${data.promptVersionId}, ${data.postId}, 'global')
          RETURNING id
        )
        INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
        SELECT id, 0 FROM batch
        RETURNING batch_id, id AS call_id
      `)
      return rows[0]!
    },
    rejectResultBeforeMismatchedSnapshot: async () => {
      await using transaction = await beginTransaction()
      const { rows } = await transaction<{ batch_id: string; call_id: string }>(sql`
        /* createClassifierFixtureResultBeforeSnapshotBatch */
        WITH batch AS (
          INSERT INTO classifier_decision_batches (
            classifier_id, prompt_version_id, post_id, scope_category
          ) VALUES (${data.classifierId}, ${data.promptVersionId}, ${data.postId}, 'global')
          RETURNING id
        )
        INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
        SELECT id, 0 FROM batch RETURNING batch_id, id AS call_id
      `)
      const lineage = rows[0]!
      await transaction(sql`/* insertClassifierFixtureResultBeforeSnapshot */
        INSERT INTO topic_classifier_results (
          topic_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
          prompt_version_id, probability, effective_lower_threshold, effective_upper_threshold,
          raw_response, scope_category
        ) VALUES (
          ${data.topicId}, ${lineage.batch_id}, ${lineage.call_id}, ${data.classifierId},
          ${data.topicCandidateId}, ${data.topicThresholdId}, ${data.promptVersionId},
          0.5, 0.3000, 0.7500, '{}'::jsonb, 'global'
        )`)
      await transaction(sql`/* insertClassifierFixtureMismatchedSnapshot */
        INSERT INTO classifier_decision_batch_candidates (
          batch_id, classifier_id, candidate_id, prompt_version_id, threshold_id,
          effective_lower_threshold, effective_upper_threshold
        ) VALUES (
          ${lineage.batch_id}, ${data.classifierId}, ${data.topicCandidateId},
          ${data.promptVersionId}, ${data.topicThresholdId}, 0.2500, 0.7500
        )`)
      await transaction.commit()
    },
    rejectCommunityResultScopeBeforeSnapshot: async () => {
      await using transaction = await beginTransaction()
      const { rows } = await transaction<{ batch_id: string; call_id: string }>(sql`
        /* createClassifierFixtureCommunityResultBeforeSnapshotBatch */
        WITH batch AS (
          INSERT INTO classifier_decision_batches (
            classifier_id, prompt_version_id, post_id, scope_category, scope_community_id
          ) VALUES (
            ${data.classifierId}, ${data.promptVersionId}, ${data.postId}, 'community_ai',
            ${data.communityId}
          ) RETURNING id
        )
        INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
        SELECT id, 0 FROM batch RETURNING batch_id, id AS call_id
      `)
      const lineage = rows[0]!
      await transaction(sql`/* insertClassifierFixtureCommunityResultBeforeSnapshot */
        INSERT INTO topic_classifier_results (
          topic_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
          prompt_version_id, probability, effective_lower_threshold, effective_upper_threshold,
          raw_response, scope_category
        ) VALUES (
          ${data.topicId}, ${lineage.batch_id}, ${lineage.call_id}, ${data.classifierId},
          ${data.topicCandidateId}, ${data.topicThresholdId}, ${data.promptVersionId},
          0.5, 0.2500, 0.7500, '{}'::jsonb, 'global'
        )`)
      await transaction(sql`/* insertClassifierFixtureCommunityResultSnapshot */
        INSERT INTO classifier_decision_batch_candidates (
          batch_id, classifier_id, candidate_id, prompt_version_id, threshold_id,
          effective_lower_threshold, effective_upper_threshold
        ) VALUES (
          ${lineage.batch_id}, ${data.classifierId}, ${data.topicCandidateId},
          ${data.promptVersionId}, ${data.topicThresholdId}, 0.2500, 0.7500
        )`)
      await transaction.commit()
    },
    insertTopicResult: (options: ResultOptions) => {
      const scopeCategory = options.communityId ? 'community_ai' : 'global'
      const usesCommunityThreshold = options.candidateId === data.communityCandidateId
      const effectiveLower = options.effectiveLower ?? (usesCommunityThreshold ? 0.3 : 0.25)
      const thresholdId =
        options.thresholdId === undefined
          ? usesCommunityThreshold
            ? data.communityThresholdId
            : options.candidateId === null
              ? null
              : data.topicThresholdId
          : options.thresholdId
      return write(sql`/* insertClassifierFixtureTopicResult */
        INSERT INTO topic_classifier_results (
          topic_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
          prompt_version_id, probability, effective_lower_threshold, effective_upper_threshold,
          raw_response, scope_category, scope_community_id
        ) VALUES (
          ${options.topicId ?? data.topicId}, ${options.batchId}, ${options.callId},
          ${data.classifierId},
          ${options.candidateId === undefined ? data.topicCandidateId : options.candidateId},
          ${thresholdId}, ${data.promptVersionId}, ${options.probability ?? 0.5},
          ${effectiveLower}, 0.7500,
          jsonb_build_object('type', 'noul', 'noul', ${options.probability ?? 0.5}::numeric),
          ${scopeCategory}, ${options.communityId ?? null}
        ) RETURNING probability::text`)
    },
    insertStoryResult: (batchId: string, callId: string, probability = 0.8) =>
      write(sql`/* insertClassifierFixtureStoryResult */
        INSERT INTO story_classifier_results (
          story_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
          prompt_version_id, probability, effective_lower_threshold, effective_upper_threshold,
          raw_response, scope_category
        ) VALUES (
          ${data.storyId}, ${batchId}, ${callId}, ${data.storyClassifierId},
          ${data.storyCandidateId}, ${data.storyThresholdId}, ${data.storyPromptVersionId},
          ${probability}, 0.2500, 0.7500,
          jsonb_build_object('type', 'choice', 'choice', 'story', 'probability', ${probability}::numeric),
          'global'
        ) RETURNING probability::text`),
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
  }
}
