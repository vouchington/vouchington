import sql from 'sql-template-strings'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

type BatchOptions = { communityId?: string; shardOrdinal?: number }

export function buildClassifierFixtureOperations(data: ClassifierFixtureData) {
  async function captureBatchCandidate(
    query: TransactionQuery,
    batchId: string,
    classifierId: string,
    candidateId: string,
    promptVersionId: string,
  ) {
    const capture = await query(sql`/* captureClassifierFixtureBatchCandidate */
      INSERT INTO classifier_decision_batch_candidates (
        batch_id, classifier_id, candidate_id, prompt_version_id, threshold_id,
        effective_lower_threshold, effective_upper_threshold
      )
      SELECT ${batchId}, ${classifierId}, ${candidateId}, ${promptVersionId}, threshold.id,
        COALESCE(threshold.lower_threshold_override, prompt.default_lower_threshold),
        COALESCE(threshold.upper_threshold_override, prompt.default_upper_threshold)
      FROM classifier_prompt_versions prompt
      JOIN LATERAL (
        SELECT candidate_threshold.*
        FROM classifier_candidate_thresholds candidate_threshold
        WHERE candidate_threshold.candidate_id = ${candidateId}
          AND candidate_threshold.prompt_version_id = ${promptVersionId}
          AND candidate_threshold.deactivated_at IS NULL
        LIMIT 1
      ) threshold ON TRUE
      WHERE prompt.id = ${promptVersionId}
    `)
    if (capture.rowCount !== 1) {
      throw new Error('classifier batch candidate capture requires exactly one active threshold')
    }
  }

  async function createAdditionalCall(batchId: string, shardOrdinal: number): Promise<string> {
    const { rows } = await write<{ id: string }>(sql`
      /* createClassifierFixtureCall */
      INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
      VALUES (${batchId}, ${shardOrdinal}) RETURNING id
    `)
    return rows[0]!.id
  }

  async function activateClassifierConfigurations(): Promise<void> {
    await using transaction = await beginTransaction()
    await transaction(sql`/* activateClassifierFixtureConfigurations */
      UPDATE classifiers SET activated_at = CURRENT_TIMESTAMP
      WHERE id IN (${data.classifierId}, ${data.storyClassifierId})
    `)
    await transaction(sql`/* activateClassifierFixturePromptConfigurations */
      UPDATE classifier_prompt_versions SET activated_at = CURRENT_TIMESTAMP
      WHERE id IN (${data.promptVersionId}, ${data.storyPromptVersionId})
    `)
    await transaction.commit()
  }

  async function createTopicBatch(options: BatchOptions = {}) {
    const scopeCategory = options.communityId ? 'community_ai' : 'global'
    await using transaction = await beginTransaction()
    const { rows } = await transaction<{ id: string }>(sql`
      /* createClassifierFixtureTopicBatch */
      INSERT INTO classifier_decision_batches (
        classifier_id, prompt_version_id, post_id, scope_category, scope_community_id
      ) VALUES (
        ${data.classifierId}, ${data.promptVersionId}, ${data.postId}, ${scopeCategory},
        ${options.communityId ?? null}
      ) RETURNING id
    `)
    const batchId = rows[0]!.id
    await captureBatchCandidate(
      transaction,
      batchId,
      data.classifierId,
      options.communityId ? data.communityCandidateId : data.topicCandidateId,
      data.promptVersionId,
    )
    const { rows: callRows } = await transaction<{ id: string }>(sql`
      /* createClassifierFixtureTopicCall */
      INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
      VALUES (${batchId}, ${options.shardOrdinal ?? 0}) RETURNING id
    `)
    await transaction.commit()
    return {
      batchId,
      callId: callRows[0]!.id,
    }
  }

  async function createStoryBatch() {
    await using transaction = await beginTransaction()
    const { rows } = await transaction<{ id: string }>(sql`
      /* createClassifierFixtureStoryBatch */
      INSERT INTO classifier_decision_batches (
        classifier_id, prompt_version_id, rss_feed_item_id, scope_category
      ) VALUES (
        ${data.storyClassifierId}, ${data.storyPromptVersionId}, ${data.rssFeedItemId}, 'global'
      ) RETURNING id
    `)
    const batchId = rows[0]!.id
    await captureBatchCandidate(
      transaction,
      batchId,
      data.storyClassifierId,
      data.storyCandidateId,
      data.storyPromptVersionId,
    )
    const { rows: callRows } = await transaction<{ id: string }>(sql`
      /* createClassifierFixtureStoryCall */
      INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
      VALUES (${batchId}, 0) RETURNING id
    `)
    await transaction.commit()
    return { batchId, callId: callRows[0]!.id }
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
    activateClassifier: () =>
      write(sql`/* activateClassifierFixtureClassifier */
        UPDATE classifiers SET activated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.classifierId}`),
    deactivateClassifier: () =>
      write(sql`/* deactivateClassifierFixtureClassifier */
        UPDATE classifiers SET deactivated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.classifierId}`),
    activatePrompt: () =>
      write(sql`/* activateClassifierFixturePrompt */
        UPDATE classifier_prompt_versions SET activated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.promptVersionId}`),
    deactivatePrompt: () =>
      write(sql`/* deactivateClassifierFixturePrompt */
        UPDATE classifier_prompt_versions SET deactivated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.promptVersionId}`),
    activateClassifierConfigurations,
    createTopicBatch,
    createStoryBatch,
    createAdditionalCall,
    rejectBatchMutation: (batchId: string) =>
      write(sql`/* rejectClassifierFixtureBatchMutation */
        UPDATE classifier_decision_batches SET scope_category = 'community_ai',
          scope_community_id = ${data.communityId} WHERE id = ${batchId}`),
    rejectBatchCandidateMutation: (batchId: string, candidateId: string) =>
      write(sql`/* rejectClassifierFixtureBatchCandidateMutation */
        UPDATE classifier_decision_batch_candidates
        SET effective_lower_threshold = 0.1000
        WHERE batch_id = ${batchId} AND candidate_id = ${candidateId}`),
    deleteBatchCandidate: (batchId: string, candidateId: string) =>
      write(sql`/* deleteClassifierFixtureBatchCandidate */
        DELETE FROM classifier_decision_batch_candidates
        WHERE batch_id = ${batchId} AND candidate_id = ${candidateId}`),
    rejectClassifierIdentityMutation: () =>
      write(sql`/* rejectClassifierFixtureIdentityMutation */
        UPDATE classifiers SET candidate_kind = 'story' WHERE id = ${data.classifierId}`),
    rejectClassifierIdMutation: () =>
      write(sql`/* rejectClassifierFixtureIdMutation */
        UPDATE classifiers SET id = uuidv7() WHERE id = ${data.classifierId}`),
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
