import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'

export type RssFeedDiscoverabilityThresholds = {
  make_discoverable_min_net_score: number
  make_discoverable_alt_min_net_score: number
  make_discoverable_min_subscriptions: number
  make_undiscoverable_max_net_score: number
}

const DEFAULTS = {
  enabled: true,
  make_discoverable_min_net_score: 5,
  make_discoverable_alt_min_net_score: 0,
  make_discoverable_min_subscriptions: 10,
  make_undiscoverable_max_net_score: -5,
}

export const rssFeedDiscoverabilityConfig = new DynamicConfig({
  key: 'rss-feed-discoverability-config',
  fieldTypes: {
    enabled: 'boolean',
    make_discoverable_min_net_score: 'number',
    make_discoverable_alt_min_net_score: 'number',
    make_discoverable_min_subscriptions: 'number',
    make_undiscoverable_max_net_score: 'number',
  },
  defaultFields: DEFAULTS,
})

export function getDiscoverabilityThresholds(): RssFeedDiscoverabilityThresholds {
  const fields = rssFeedDiscoverabilityConfig.getFields()
  const thresholds = {
    make_discoverable_min_net_score:
      typeof fields.make_discoverable_min_net_score === 'number'
        ? fields.make_discoverable_min_net_score
        : DEFAULTS.make_discoverable_min_net_score,
    make_discoverable_alt_min_net_score:
      typeof fields.make_discoverable_alt_min_net_score === 'number'
        ? fields.make_discoverable_alt_min_net_score
        : DEFAULTS.make_discoverable_alt_min_net_score,
    make_discoverable_min_subscriptions:
      typeof fields.make_discoverable_min_subscriptions === 'number'
        ? fields.make_discoverable_min_subscriptions
        : DEFAULTS.make_discoverable_min_subscriptions,
    make_undiscoverable_max_net_score:
      typeof fields.make_undiscoverable_max_net_score === 'number'
        ? fields.make_undiscoverable_max_net_score
        : DEFAULTS.make_undiscoverable_max_net_score,
  }

  if (
    thresholds.make_undiscoverable_max_net_score < thresholds.make_discoverable_alt_min_net_score &&
    thresholds.make_discoverable_alt_min_net_score <= thresholds.make_discoverable_min_net_score
  ) {
    return thresholds
  }

  onError(new Error(`Invalid RSS feed discoverability config: ${JSON.stringify(fields)}`))
  return DEFAULTS
}

export function isAutoDiscoverabilityEnabled(): boolean {
  const value = rssFeedDiscoverabilityConfig.getFields().enabled
  return typeof value === 'boolean' ? value : DEFAULTS.enabled
}
