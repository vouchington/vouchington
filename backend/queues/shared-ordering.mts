import type { JobOptions } from 'glide-mq'

export const orderingConfigField = (key: string): string =>
  `ordering_${key.replaceAll(/[^a-z0-9]/g, '_')}`

export const orderingMaxValue = (defaultValue: number): number =>
  defaultValue === 1 ? 1 : defaultValue * 4

export function orderingConfigFields(caps: Record<string, number>) {
  const entries = Object.entries(caps)
  return {
    fieldTypes: Object.fromEntries(
      entries.map(([key]) => [orderingConfigField(key), 'number' as const]),
    ),
    defaultFields: Object.fromEntries(
      entries.map(([key, defaultValue]) => [orderingConfigField(key), defaultValue]),
    ),
    maxValues: Object.fromEntries(
      entries.map(([key, defaultValue]) => [
        orderingConfigField(key),
        orderingMaxValue(defaultValue),
      ]),
    ),
    descriptions: Object.fromEntries(
      entries.map(([key]) => [
        orderingConfigField(key),
        `Maximum concurrent jobs in the ${key} ordering lane across all workers.`,
      ]),
    ),
  }
}

export function assertSharedJobOrdering(
  job: { name: string; domain: string; options: Readonly<JobOptions> },
  isConfiguredKey: (key: string) => boolean,
): void {
  const key = job.options.ordering?.key
  if (!key || (key !== job.domain && !key.startsWith(`${job.domain}:`))) {
    throw new Error(`Job ${job.name} needs a domain-prefixed ordering key`)
  }
  if (!isConfiguredKey(key)) {
    throw new Error(`Job ${job.name} has no configured ordering cap for ${key}`)
  }
}
