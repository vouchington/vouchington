import {
  hackerNewsReferenceConfig,
  hackerNewsReferenceMaxValues,
} from '@services/urls/hacker-news-reference-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const hackerNewsReferenceRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'hacker-news-reference-config',
  label: 'Hacker News reference limits',
  description: 'Bounds stored reference rows and batched card reads.',
  config: hackerNewsReferenceConfig,
  access: { update_roles: ['developer'] },
  fields: {
    stories_per_url: {
      description: 'Maximum story rows per URL.',
      minValue: 1,
      maxValue: hackerNewsReferenceMaxValues.stories_per_url,
      integer: true,
    },
    comments_per_url: {
      description: 'Maximum comment rows per URL.',
      minValue: 1,
      maxValue: hackerNewsReferenceMaxValues.comments_per_url,
      integer: true,
    },
    url_batch_size: {
      description: 'Maximum URL ids per read statement.',
      minValue: 1,
      maxValue: hackerNewsReferenceMaxValues.url_batch_size,
      integer: true,
    },
  },
})
