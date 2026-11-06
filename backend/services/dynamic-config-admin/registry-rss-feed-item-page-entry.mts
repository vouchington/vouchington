import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import {
  rssFeedItemPageConfig,
  rssFeedItemPageMaxima,
} from '@services/feeds/rss-feed-items/feed-page-config'

export const rssFeedItemPageRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'rss-feed-item-page-config',
  label: 'RSS Feed Item Pages',
  description: 'Limits the sources and candidates examined for one personalized RSS feed page.',
  config: rssFeedItemPageConfig,
  access: { update_roles: ['developer'] },
  fields: {
    source_limit: {
      description: 'Maximum followed RSS feed and topic sources considered per page.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.source_limit,
      integer: true,
    },
    items_per_source: {
      description: 'Maximum ordered item candidates read from each selected feed or topic.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.items_per_source,
      integer: true,
    },
    story_item_limit: {
      description: 'Maximum indexed members considered per story candidate.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.story_item_limit,
      integer: true,
    },
    eligibility_child_limit: {
      description:
        'Maximum source, topic, hashtag, and story children checked for item eligibility.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.eligibility_child_limit,
      integer: true,
    },
    share_limit: {
      description: 'Maximum ordered share candidates read per page.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.share_limit,
      integer: true,
    },
    exclusion_relation_limit: {
      description: 'Maximum direct or proxy exclusion records read; overflow omits all results.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.exclusion_relation_limit,
      integer: true,
    },
  },
})
