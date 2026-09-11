import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'

export type PostRelatedUrlDisplayConfig = {
  summary_limit: number
}

export const POST_RELATED_URL_DISPLAY_CONFIG_KEY = 'post-related-url-display-config'

export const DEFAULT_POST_RELATED_URL_DISPLAY_CONFIG: PostRelatedUrlDisplayConfig = {
  summary_limit: 10,
}

export const POST_RELATED_URL_DISPLAY_MIN_VALUES: PostRelatedUrlDisplayConfig = {
  summary_limit: 1,
}

export const POST_RELATED_URL_DISPLAY_MAX_VALUES: PostRelatedUrlDisplayConfig = {
  summary_limit: 10,
}

export const postRelatedUrlDisplayConfig = new DynamicConfig({
  key: POST_RELATED_URL_DISPLAY_CONFIG_KEY,
  fieldTypes: { summary_limit: 'number' },
  defaultFields: DEFAULT_POST_RELATED_URL_DISPLAY_CONFIG,
})

export function getPostRelatedUrlDisplayConfig(): PostRelatedUrlDisplayConfig {
  const value = postRelatedUrlDisplayConfig.getFields().summary_limit
  if (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= POST_RELATED_URL_DISPLAY_MIN_VALUES.summary_limit &&
      value <= POST_RELATED_URL_DISPLAY_MAX_VALUES.summary_limit)
  ) {
    return { summary_limit: value ?? DEFAULT_POST_RELATED_URL_DISPLAY_CONFIG.summary_limit }
  }

  onError(new Error(`Invalid post related URL display summary_limit: ${JSON.stringify(value)}`))
  return DEFAULT_POST_RELATED_URL_DISPLAY_CONFIG
}
