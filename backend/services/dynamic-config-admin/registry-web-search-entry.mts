import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import { WEB_SEARCH_MAX_VALUES, webSearchConfig } from '@services/web-search/config'

export const webSearchRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'web-search-config',
  label: 'Web Search',
  description: 'Bounds the crawl chunks ranked by each web search request.',
  config: webSearchConfig,
  access: { update_roles: ['developer'] },
  fields: {
    chunk_cap: {
      description:
        'Maximum matching crawl chunks ranked per request; the best chunk per URL is chosen from these.',
      minValue: 1,
      maxValue: WEB_SEARCH_MAX_VALUES.chunk_cap,
      integer: true,
    },
  },
})
