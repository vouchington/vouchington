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
    max_windows_per_page: {
      description: 'Maximum bounded candidate windows inspected while seeking a nonempty page.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.max_windows_per_page,
      integer: true,
    },
    proxy_follow_input_limit: {
      description: 'Maximum active proxy community follows considered per candidate window.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.proxy_follow_input_limit,
      integer: true,
    },
    community_list_input_limit: {
      description: 'Maximum indexed list entries inspected per community and source kind.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.community_list_input_limit,
      integer: true,
    },
    source_limit: {
      description: 'Maximum followed RSS feed and topic sources considered per candidate window.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.source_limit,
      integer: true,
    },
    story_item_limit: {
      description:
        'Maximum newer story members checked before proving an item is the representative.',
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
    exclusion_relation_limit: {
      description: 'Maximum direct or proxy exclusion records read; overflow omits all results.',
      minValue: 1,
      maxValue: rssFeedItemPageMaxima.exclusion_relation_limit,
      integer: true,
    },
  },
})
