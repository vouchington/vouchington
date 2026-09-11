import { getDominantPublisherTypeSlug } from '@services/topics/get-dominant-publisher-type'
import { setRssFeedDiscoverabilityAsSystem } from './discoverability.mts'
import {
  getDiscoverabilityThresholds,
  isAutoDiscoverabilityEnabled,
} from './discoverability-config.mts'
import { getRssFeedFollowCount } from './get-follow-count.mts'
import { getRssFeedWithTopicForDiscoverability } from './get-with-topic-for-discoverability.mts'

export type EvaluateRssFeedDiscoverabilityResult =
  | 'noop'
  | 'updated'
  | 'skipped:disabled'
  | 'skipped:not-found'
  | 'skipped:deleted'
  | 'skipped:in-deadband'
  | 'skipped:human-locked'

export async function evaluateRssFeedDiscoverability(
  rssFeedId: string,
): Promise<EvaluateRssFeedDiscoverabilityResult> {
  if (!isAutoDiscoverabilityEnabled()) return 'skipped:disabled'

  const feed = await getRssFeedWithTopicForDiscoverability(rssFeedId)
  if (!feed) return 'skipped:not-found'
  if (feed.deleted_at) return 'skipped:deleted'

  const publisherTypeSlug = await getDominantPublisherTypeSlug(feed.topic_id)
  if (publisherTypeSlug === 'aggregator' || publisherTypeSlug === 'forum') {
    return setRssFeedDiscoverabilityAsSystem({
      rssFeedId,
      enabled: false,
      overrideHumanLock: true,
      reason: `auto: publisher_type=${publisherTypeSlug}`,
    })
  }

  const thresholds = getDiscoverabilityThresholds()
  const score = feed.topic_votes_score_net
  if (score >= thresholds.make_discoverable_min_net_score) {
    return setRssFeedDiscoverabilityAsSystem({
      rssFeedId,
      enabled: true,
      reason: `auto: net_score=${score}`,
    })
  }

  if (score >= thresholds.make_discoverable_alt_min_net_score) {
    const subscriptions = await getRssFeedFollowCount(rssFeedId)
    if (subscriptions >= thresholds.make_discoverable_min_subscriptions) {
      return setRssFeedDiscoverabilityAsSystem({
        rssFeedId,
        enabled: true,
        reason: `auto: net_score=${score}, subs=${subscriptions}`,
      })
    }
  }

  if (score <= thresholds.make_undiscoverable_max_net_score) {
    return setRssFeedDiscoverabilityAsSystem({
      rssFeedId,
      enabled: false,
      reason: `auto: net_score=${score}`,
    })
  }

  return 'skipped:in-deadband'
}
