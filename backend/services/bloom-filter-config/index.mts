import { DynamicConfig } from '@data-stores/valkey'

export const bloomFilterConfig = new DynamicConfig({
  key: 'bloom-filter-config',
  fieldTypes: {
    entityCacheBloomFilterEnabled: 'boolean',
    embeddingBloomFilterEnabled: 'boolean',
    urlBlocklistBloomFilterEnabled: 'boolean',
    emailBlocklistBloomFilterEnabled: 'boolean',
    bookmarkBloomFilterEnabled: 'boolean',
    apiKeyBloomFilterEnabled: 'boolean',
  },
  defaultFields: {
    entityCacheBloomFilterEnabled: true,
    embeddingBloomFilterEnabled: true,
    urlBlocklistBloomFilterEnabled: true,
    emailBlocklistBloomFilterEnabled: true,
    bookmarkBloomFilterEnabled: true,
    apiKeyBloomFilterEnabled: true,
  },
})
