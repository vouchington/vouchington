import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const SEMANTIC_TOPIC_CANDIDATE_LIMIT = 200
export const SEMANTIC_TOPIC_CANDIDATE_MAX = 500
export const TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT = 100
export const TOOLS_SEMANTIC_TOPIC_CANDIDATE_MAX = 250

const defaultFields = {
  alias_post_invalidation_batch_size: 100,
  parent_merge_cycle_max_depth: 64,
  semantic_topic_candidate_limit: SEMANTIC_TOPIC_CANDIDATE_LIMIT,
  tools_semantic_topic_candidate_limit: TOOLS_SEMANTIC_TOPIC_CANDIDATE_LIMIT,
  viewer_count_input_cap: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const topicsWorkMaxValues = {
  alias_post_invalidation_batch_size: 1000,
  parent_merge_cycle_max_depth: 256,
  semantic_topic_candidate_limit: SEMANTIC_TOPIC_CANDIDATE_MAX,
  tools_semantic_topic_candidate_limit: TOOLS_SEMANTIC_TOPIC_CANDIDATE_MAX,
  viewer_count_input_cap: 1000,
}

export const topicsWorkConfig = new DynamicConfig({
  key: 'topics-work-config',
  fieldTypes: {
    alias_post_invalidation_batch_size: 'number',
    parent_merge_cycle_max_depth: 'number',
    semantic_topic_candidate_limit: 'number',
    tools_semantic_topic_candidate_limit: 'number',
    viewer_count_input_cap: 'number',
  },
  defaultFields,
})

export function getTopicsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(topicsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: topicsWorkMaxValues[field],
  })
}
