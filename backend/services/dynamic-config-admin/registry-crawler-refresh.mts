import {
  crawlerRefreshWorkConfig,
  CRAWLER_REFRESH_COOLDOWN_MAX_MINUTES,
} from '@services/crawlers/refresh-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const crawlerRefreshRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'crawler-refresh-work-config',
  label: 'Crawler refresh work',
  description:
    'Bounded URL candidate selection during crawler retries and weekly hostname refresh.',
  config: crawlerRefreshWorkConfig,
  access: { update_roles: ['developer'] },
  fields: {
    recent_crawl_cooldown_minutes: {
      description:
        'Minutes after any crawl reservation before the URL can be a refresh candidate again.',
      minValue: 1,
      maxValue: CRAWLER_REFRESH_COOLDOWN_MAX_MINUTES,
      integer: true,
    },
    retry_crawl_url_count: {
      description: 'Maximum alternative URL candidates considered for one hostname.',
      minValue: 1,
      maxValue: 20,
      integer: true,
    },
  },
})
