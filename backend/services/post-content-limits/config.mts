import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'

export type PostContentLimitsConfig = {
  data_point_topic_ids_max_items: number
  review_topic_ratings_max_items: number
}

export const POST_CONTENT_LIMITS_CONFIG_KEY = 'post-content-limits-config'

export const DEFAULT_POST_CONTENT_LIMITS: PostContentLimitsConfig = {
  data_point_topic_ids_max_items: 5,
  review_topic_ratings_max_items: 5,
}

const fieldTypes: Record<keyof PostContentLimitsConfig, 'number'> = {
  data_point_topic_ids_max_items: 'number',
  review_topic_ratings_max_items: 'number',
}

export const POST_CONTENT_LIMITS_MIN_VALUES: PostContentLimitsConfig = {
  data_point_topic_ids_max_items: 1,
  review_topic_ratings_max_items: 2,
}

export const POST_CONTENT_LIMITS_MAX_VALUES: PostContentLimitsConfig = {
  data_point_topic_ids_max_items: 100,
  review_topic_ratings_max_items: 100,
}

export const postContentLimitsConfig = new DynamicConfig({
  key: POST_CONTENT_LIMITS_CONFIG_KEY,
  fieldTypes,
  defaultFields: DEFAULT_POST_CONTENT_LIMITS,
})

export function getPostContentLimitsConfig(): PostContentLimitsConfig {
  const fields = postContentLimitsConfig.getFields()
  const result = { ...DEFAULT_POST_CONTENT_LIMITS }
  for (const key of Object.keys(DEFAULT_POST_CONTENT_LIMITS) as Array<
    keyof PostContentLimitsConfig
  >) {
    const value = fields[key]
    if (value === undefined) continue
    if (
      Number.isInteger(value) &&
      (value as number) >= POST_CONTENT_LIMITS_MIN_VALUES[key] &&
      (value as number) <= POST_CONTENT_LIMITS_MAX_VALUES[key]
    ) {
      result[key] = value as number
    } else {
      onError(
        new Error(`Invalid post content limits config field ${key}: ${JSON.stringify(value)}`),
      )
    }
  }
  return result
}
