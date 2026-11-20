import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const SEMANTIC_POST_CANDIDATE_LIMIT = 1000

const defaultFields = {
  semantic_post_candidate_limit: SEMANTIC_POST_CANDIDATE_LIMIT,
  review_succession_candidate_page_size: 100,
  feed_inspected_row_cap: 1000,
  topic_walk_row_cap: 1000,
  max_posts_per_url: 5,
}

/** Hard ceilings for the current runtime configuration contract. */
export const postsWorkMaxValues = {
  semantic_post_candidate_limit: SEMANTIC_POST_CANDIDATE_LIMIT,
  review_succession_candidate_page_size: 1000,
  feed_inspected_row_cap: 1000,
  // Equal to the default, like feed_inspected_row_cap: the walk's plan is tuned for this inspected window.
  topic_walk_row_cap: 1000,
  max_posts_per_url: 50,
}

export const postsWorkConfig = new DynamicConfig({
  key: 'posts-work-config',
  fieldTypes: {
    semantic_post_candidate_limit: 'number',
    review_succession_candidate_page_size: 'number',
    feed_inspected_row_cap: 'number',
    topic_walk_row_cap: 'number',
    max_posts_per_url: 'number',
  },
  defaultFields,
})

export function getPostsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(postsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: postsWorkMaxValues[field],
  })
}
