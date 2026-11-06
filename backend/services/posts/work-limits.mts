import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const SEMANTIC_POST_CANDIDATE_LIMIT = 1000

const defaultFields = {
  hacker_news_hot_candidate_limit: 1000,
  semantic_post_candidate_limit: SEMANTIC_POST_CANDIDATE_LIMIT,
  review_succession_candidate_page_size: 100,
  profile_post_count_cap: 1000,
  data_point_community_page_size: 25,
  data_point_child_limit: 25,
}

/** Hard ceilings for the current runtime configuration contract. */
export const postsWorkMaxValues = {
  hacker_news_hot_candidate_limit: 10000,
  semantic_post_candidate_limit: SEMANTIC_POST_CANDIDATE_LIMIT,
  review_succession_candidate_page_size: 1000,
  profile_post_count_cap: 10_000,
  data_point_community_page_size: 100,
  data_point_child_limit: 100,
}

export const postsWorkConfig = new DynamicConfig({
  key: 'posts-work-config',
  fieldTypes: {
    hacker_news_hot_candidate_limit: 'number',
    semantic_post_candidate_limit: 'number',
    review_succession_candidate_page_size: 'number',
    profile_post_count_cap: 'number',
    data_point_community_page_size: 'number',
    data_point_child_limit: 'number',
  },
  defaultFields,
})

export function getPostsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(postsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: postsWorkMaxValues[field],
  })
}
