import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const WEB_SEARCH_MAX_VALUES = { chunk_cap: 10_000 }
const DEFAULT_CHUNK_CAP = 1_000

export const webSearchConfig = new DynamicConfig({
  key: 'web-search-config',
  fieldTypes: { chunk_cap: 'number' },
  defaultFields: { chunk_cap: DEFAULT_CHUNK_CAP },
})

/** Matching crawl chunks ranked before the best chunk per URL is chosen. */
export function getWebSearchChunkCap(): number {
  return getBoundedPositiveIntegerField(webSearchConfig, 'chunk_cap', {
    defaultValue: DEFAULT_CHUNK_CAP,
    maxValue: WEB_SEARCH_MAX_VALUES.chunk_cap,
  })
}
