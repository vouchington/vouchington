import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import { insertTestCommunityAgentPrompt } from '../../entities/communities.mts'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

type CommunityPromptResultOptions = {
  batchId: string
  callId: string
  promptId?: string
  communityId?: string
  probability?: number
  effectiveLower?: number
}

/**
 * A community-prompt classifier with its own active-able prompt revision (thresholds 0.25/0.75)
 * and one community moderation prompt owned by the fixture's community.
 */
export async function createClassifierCommunityPromptFixtureData(data: ClassifierFixtureData) {
  const { rows: classifierRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureCommunityPromptClassifier */
    INSERT INTO classifiers (slug, primitive, candidate_kind)
    VALUES (${`community-prompt-${randomUUID()}`}, 'noul', 'community_prompt')
    RETURNING id
  `)
  const communityPromptClassifierId = classifierRows[0]!.id
  const { rows: promptRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureCommunityPromptVersion */
    INSERT INTO classifier_prompt_versions (
      classifier_id, prompt, model_name, model_provider,
      default_lower_threshold, default_upper_threshold
    ) VALUES (
      ${communityPromptClassifierId}, 'Classify the post for the community.',
      'typesafe/jev-1.13', 'typesafe', 0.2500, 0.7500
    ) RETURNING id
  `)
  const prompt = await insertTestCommunityAgentPrompt({
    communityId: data.communityId,
    createdById: data.auditUserId,
  })
  return {
    communityPromptClassifierId,
    communityPromptVersionId: promptRows[0]!.id,
    communityPromptId: prompt.id,
  }
}

export type ClassifierCommunityPromptFixtureData = Awaited<
  ReturnType<typeof createClassifierCommunityPromptFixtureData>
>

export function buildClassifierCommunityPromptFixtureOperations(
  data: ClassifierFixtureData,
  prompts: ClassifierCommunityPromptFixtureData,
) {
  return {
    activateCommunityPromptConfiguration: async () => {
      await write(sql`/* activateClassifierFixtureCommunityPromptClassifier */
        UPDATE classifiers SET activated_at = CURRENT_TIMESTAMP
        WHERE id = ${prompts.communityPromptClassifierId}`)
      await write(sql`/* activateClassifierFixtureCommunityPromptVersion */
        UPDATE classifier_prompt_versions SET activated_at = CURRENT_TIMESTAMP
        WHERE id = ${prompts.communityPromptVersionId}`)
    },
    createCommunityPrompt: async (options: { communityId?: string } = {}) =>
      (
        await insertTestCommunityAgentPrompt({
          communityId: options.communityId ?? data.communityId,
          createdById: data.auditUserId,
        })
      ).id,
    createCommunityPromptBatch: async (options: { communityId?: string } = {}) => {
      const { rows } = await write<{ batch_id: string; call_id: string }>(sql`
        /* createClassifierFixtureCommunityPromptBatch */
        WITH batch AS (
          INSERT INTO classifier_decision_batches (
            classifier_id, prompt_version_id, post_id, scope_category, scope_community_id
          ) VALUES (
            ${prompts.communityPromptClassifierId}, ${prompts.communityPromptVersionId},
            ${data.postId}, 'community_ai', ${options.communityId ?? data.communityId}
          ) RETURNING id
        )
        INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
        SELECT id, 0 FROM batch RETURNING batch_id, id AS call_id
      `)
      return { batchId: rows[0]!.batch_id, callId: rows[0]!.call_id }
    },
    insertCommunityPromptResult: (options: CommunityPromptResultOptions) =>
      write<{ probability: string }>(sql`/* insertClassifierFixtureCommunityPromptResult */
        INSERT INTO community_prompt_classifier_results (
          community_prompt_id, batch_id, decision_call_id, classifier_id, prompt_version_id,
          probability, effective_lower_threshold, effective_upper_threshold,
          raw_response, scope_category, scope_community_id
        ) VALUES (
          ${options.promptId ?? prompts.communityPromptId}, ${options.batchId}, ${options.callId},
          ${prompts.communityPromptClassifierId}, ${prompts.communityPromptVersionId},
          ${options.probability ?? 0.5}, ${options.effectiveLower ?? 0.25}, 0.7500,
          jsonb_build_object('type', 'noul', 'noul', ${options.probability ?? 0.5}::numeric),
          'community_ai', ${options.communityId ?? data.communityId}
        ) RETURNING probability::text`),
    updateCommunityPromptResultProbability: (batchId: string) =>
      write(sql`/* updateClassifierFixtureCommunityPromptResult */
        UPDATE community_prompt_classifier_results SET probability = 0.9 WHERE batch_id = ${batchId}`),
    createCommunityPromptRssBatch: async () => {
      const { rows } = await write<{ batch_id: string; call_id: string }>(sql`
        /* createClassifierFixtureCommunityPromptRssBatch */
        WITH batch AS (
          INSERT INTO classifier_decision_batches (
            classifier_id, prompt_version_id, rss_feed_item_id, scope_category, scope_community_id
          ) VALUES (
            ${prompts.communityPromptClassifierId}, ${prompts.communityPromptVersionId},
            ${data.rssFeedItemId}, 'community_ai', ${data.communityId}
          ) RETURNING id
        )
        INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
        SELECT id, 0 FROM batch RETURNING batch_id, id AS call_id
      `)
      return { batchId: rows[0]!.batch_id, callId: rows[0]!.call_id }
    },
    deleteCommunityPrompt: () =>
      write(sql`/* deleteClassifierFixtureCommunityPrompt */
        DELETE FROM community_agent_prompts WHERE id = ${prompts.communityPromptId}`),
    countCommunityPromptResults: async (batchId: string) => {
      const { rows } = await write<{ results: number }>(sql`
        /* countClassifierFixtureCommunityPromptResults */
        SELECT count(*)::integer AS results FROM community_prompt_classifier_results
        WHERE batch_id = ${batchId}`)
      return rows[0]!.results
    },
  }
}
