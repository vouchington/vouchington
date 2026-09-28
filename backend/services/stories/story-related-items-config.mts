import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'

export const STORY_RELATED_ITEMS_CONFIG_KEY = 'story-related-items-config'
export const DEFAULT_STORY_RELATED_ITEMS_CONFIG = { preview_limit: 3 }
export const storyRelatedItemsConfig = new DynamicConfig({
  key: STORY_RELATED_ITEMS_CONFIG_KEY,
  fieldTypes: { preview_limit: 'number' },
  defaultFields: DEFAULT_STORY_RELATED_ITEMS_CONFIG,
})

export function getStoryRelatedItemsConfig(): { preview_limit: number } {
  const preview_limit = storyRelatedItemsConfig.getFields().preview_limit
  if (preview_limit === undefined) return DEFAULT_STORY_RELATED_ITEMS_CONFIG
  if (
    typeof preview_limit === 'number' &&
    Number.isInteger(preview_limit) &&
    preview_limit >= 1 &&
    preview_limit <= 3
  )
    return { preview_limit }
  onError(new Error(`Invalid story preview_limit: ${JSON.stringify(preview_limit)}`))
  return DEFAULT_STORY_RELATED_ITEMS_CONFIG
}
