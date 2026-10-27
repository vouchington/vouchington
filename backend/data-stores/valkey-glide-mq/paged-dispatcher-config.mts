import { DynamicConfig } from '@data-stores/valkey-core/dynamic-config'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export type PagedDispatcher =
  | 'hostnames'
  | 'rss'
  | 'kagi'
  | 'elections'
  | 'notifications'
  | 'activitypub'
  | 'images'
  | 'memberships'
const defaultFields = {
  images_page_size: 100,
  images_backoff_ms: 300000,
  hostnames_page_size: 500,
  hostnames_backoff_ms: 300000,
  rss_page_size: 500,
  rss_backoff_ms: 300000,
  kagi_page_size: 500,
  kagi_backoff_ms: 300000,
  elections_page_size: 500,
  elections_backoff_ms: 300000,
  notifications_page_size: 500,
  notifications_backoff_ms: 300000,
  activitypub_page_size: 500,
  activitypub_backoff_ms: 300000,
  memberships_page_size: 500,
  memberships_backoff_ms: 300000,
  memberships_max_depth: 10000,
  background_max_depth: 10000,
  'background-cpu_max_depth': 10000,
}
export const pagedDispatchMaxValues = Object.fromEntries(
  Object.keys(defaultFields).map(key => [
    key,
    key.endsWith('_page_size') ? 5000 : key.endsWith('_backoff_ms') ? 300000 : 1000000,
  ]),
)
export const pagedDispatchConfig = new DynamicConfig({
  key: 'paged-dispatch-work-config',
  fieldTypes: Object.fromEntries(Object.keys(defaultFields).map(key => [key, 'number' as const])),
  defaultFields,
})
export function getPagedDispatchLimit(field: string): number {
  if (!(field in defaultFields)) throw new TypeError(`Unknown paged-dispatch setting: ${field}`)
  const key = field as keyof typeof defaultFields
  return getBoundedPositiveIntegerField(pagedDispatchConfig, key, {
    defaultValue: defaultFields[key],
    maxValue: pagedDispatchMaxValues[key]!,
  })
}
