import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { NormalizedClassifierDecisionInput } from './decision-input.mts'
import { buildColumnArrays, type PersistedInputRow } from './write-decision-result-columns.mts'

/**
 * Community moderation prompt results carry no stored candidate or threshold revision: the
 * thresholds are the prompt version's defaults, enforced again by the table's own trigger.
 */
export async function insertCommunityPromptResults(
  query: OwnedTransaction,
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
): Promise<number> {
  const { scopeCategory, scopeCommunityId } = input.scope
  if (scopeCategory !== 'community_ai' || scopeCommunityId === null) {
    throw new Error('Community prompt classifier results require a community scope')
  }
  const values = buildColumnArrays(rows)
  const { rowCount } = await query(sql`/* insertCommunityPromptClassifierDecisionResults */
    INSERT INTO community_prompt_classifier_results (
      community_prompt_id, batch_id, decision_call_id, classifier_id, prompt_version_id,
      probability, effective_lower_threshold, effective_upper_threshold, raw_response,
      scope_category, scope_community_id
    )
    SELECT community_prompt_id, ${input.batchId}, decision_call_id, ${input.classifierId},
      ${input.promptVersionId}, probability, lower_threshold, upper_threshold,
      raw_response::jsonb, ${scopeCategory}, ${scopeCommunityId}
    FROM unnest(
      ${values.entityIds}::uuid[], ${values.callIds}::uuid[], ${values.probabilities}::numeric[],
      ${values.lowerThresholds}::numeric[], ${values.upperThresholds}::numeric[],
      ${values.rawResponses}::text[]
    ) AS values(
      community_prompt_id, decision_call_id, probability, lower_threshold, upper_threshold,
      raw_response
    )`)
  return rowCount ?? 0
}
