import { orderingMaxValue } from '@data-stores/valkey-glide-mq/shared-queue-ordering'

export const BACKGROUNDCPU_ORDERING_CAPS = {
  'crawl:task': 64,
  'crawl:dispatch': 4,
  'crawl:boilerplate': 4,
  'crawl:hostname': 1,
  'crawl:unfurl': 5,
  'crawl:remove_unfurled_children': 1,
  'bedrock-embeddings:single': 2,
  'bedrock-embeddings:creation': 1,
  'bedrock-embeddings:polling': 2,
  'bedrock-embeddings:dispatcher': 1,
  'bedrock-embeddings:reconciliation': 1,
  'ai-spend-cap': 1,
  'content-analysis:task': 32,
  'content-analysis:dispatch': 4,
} as const

export function getBackgroundCpuOrderingLimits(key: string): {
  configKey: string
  defaultValue: number
  maxValue: number
} {
  const configKey = cpuOrderingConfigKey(key)
  const defaultValue =
    BACKGROUNDCPU_ORDERING_CAPS[configKey as keyof typeof BACKGROUNDCPU_ORDERING_CAPS]
  if (defaultValue === undefined)
    throw new Error(`Unregistered background-cpu ordering key: ${key}`)
  return { configKey, defaultValue, maxValue: orderingMaxValue(defaultValue) }
}

function cpuOrderingConfigKey(key: string): string {
  if (key.startsWith('crawl:remove_unfurled_children__')) return 'crawl:remove_unfurled_children'
  if (/^crawl:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return 'crawl:hostname'
  }
  return key
}
