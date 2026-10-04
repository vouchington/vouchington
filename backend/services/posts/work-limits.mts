import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  review_succession_history_audit_page_size: 100,
  review_succession_candidate_page_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const postsWorkMaxValues = {
  review_succession_history_audit_page_size: 1000,
  review_succession_candidate_page_size: 1000,
}

export const postsWorkConfig = new DynamicConfig({
  key: 'posts-work-config',
  fieldTypes: {
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
