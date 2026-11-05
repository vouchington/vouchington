import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  follow_user: 10000,
  follow_topic: 10000,
  follow_rss_feed: 10000,
  follow_post: 10000,
  subscribe_user: 10000,
  subscribe_post: 10000,
  subscribe_rss_feed: 10000,
  subscribe_posts_topic: 10000,
  subscribe_rss_feed_items_topic: 10000,
}
type LimitField = keyof typeof defaultFields
export const relationLimitsMaxValues = Object.fromEntries(
  Object.keys(defaultFields).map(field => [field, 50000]),
) as Record<LimitField, number>
export const relationLimitsConfig = new DynamicConfig({
  key: 'relation-limits-config',
  fieldTypes: Object.fromEntries(
    Object.keys(defaultFields).map(field => [field, 'number']),
  ) as Record<LimitField, 'number'>,
  defaultFields,
})
const tableFields: Record<string, LimitField> = {
  relation__user__follow__user: 'follow_user',
  relation__user__follow__topic: 'follow_topic',
  relation__user__follow__rss_feed: 'follow_rss_feed',
  relation__user__follow__post: 'follow_post',
  relation__user__subscribe__user: 'subscribe_user',
  relation__user__subscribe__post: 'subscribe_post',
  relation__user__subscribe__rss_feed: 'subscribe_rss_feed',
  relation__user__subscribe_posts__topic: 'subscribe_posts_topic',
  relation__user__subscribe_rss_feed_items__topic: 'subscribe_rss_feed_items_topic',
}

export function getRelationTypeLimit(tableName: string): number | null {
  const field = tableFields[tableName]
  return field
    ? getBoundedPositiveIntegerField(relationLimitsConfig, field, {
        defaultValue: defaultFields[field],
        maxValue: relationLimitsMaxValues[field],
      })
    : null
}
