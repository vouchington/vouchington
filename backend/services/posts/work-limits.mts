import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const SEMANTIC_POST_CANDIDATE_LIMIT = 1000

const defaultFields = {
  semantic_post_candidate_limit: SEMANTIC_POST_CANDIDATE_LIMIT,
  review_succession_history_audit_page_size: 100,
  review_succession_candidate_page_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const postsWorkMaxValues = {
  semantic_post_candidate_limit: SEMANTIC_POST_CANDIDATE_LIMIT,
  review_succession_history_audit_page_size: 1000,
  review_succession_candidate_page_size: 1000,
}

export const postsWorkConfig = new DynamicConfig({
  key: 'posts-work-config',
  fieldTypes: {
    semantic_post_candidate_limit: 'number',
    review_succession_history_audit_page_size: 'number',
    review_succession_candidate_page_size: 'number',
  },
  defaultFields,
})

export function getPostsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(postsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: postsWorkMaxValues[field],
  })
}
