import { orderingMaxValue } from '@data-stores/valkey-glide-mq/shared-queue-ordering'

export const BACKGROUND_ORDERING_CAPS = {
  'ses-inbound': 1,
  'openai-moderation': 5,
  'post-mentions': 5,
  'story-post-related-url-projections': 1,
  'post-publication': 1,
  'vote-aggregation': 10,
  'entity-listeners': 5,
  'account-lifecycle': 2,
  'article-sync': 1,
  'oauth-authorization-exchange': 4,
  'oauth-authorization-exchange:dispatcher': 1,
  notifications: 5,
  'activitypub:outbound': 5,
  'activitypub:inbound': 4,
  'activitypub:cleanup': 1,
  'follower-distributions': 5,
  'bluesky-follow-propagation': 1,
  'rss-feeds': 5,
  'rss-feeds:dispatcher': 1,
  'fediverse-instances': 5,
  'urls-domains-blacklist': 5,
  'urls-domains-blacklist:dispatcher': 1,
  'urls-domains-blacklist:cache-invalidation': 1,
  'sitemaps:post_day_today': 1,
  'sitemaps:post_day_past': 1,
  'sitemaps:indexes': 1,
  'sitemaps:dispatcher': 1,
  'cache-purge': 5,
  'kagi-smallweb': 5,
  'kagi-smallweb:dispatcher': 1,
  'email-digests': 5,
  'email-digests:engagement-dispatcher': 1,
  imports: 10,
  'moderation-signals': 10,
} as const

export function getBackgroundOrderingLimits(key: string): {
  configKey: string
  defaultValue: number
  maxValue: number
} {
  const configKey = key
  const defaultValue = BACKGROUND_ORDERING_CAPS[configKey as keyof typeof BACKGROUND_ORDERING_CAPS]
  if (defaultValue === undefined) throw new Error(`Unregistered background ordering key: ${key}`)
  return { configKey, defaultValue, maxValue: orderingMaxValue(defaultValue) }
}
