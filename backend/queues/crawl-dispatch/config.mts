import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100

const defaultFields = { batch_size: 500 }

/** Hard ceilings for the current runtime configuration contract. */
export const crawlBoilerplateRemovalWorkMaxValues = { batch_size: 5000 }

export const crawlBoilerplateRemovalWorkConfig = new DynamicConfig({
  key: 'crawl-boilerplate-removal-work-config',
  fieldTypes: { batch_size: 'number' },
  defaultFields,
})

export function getCrawlBoilerplateRemovalWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(crawlBoilerplateRemovalWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: crawlBoilerplateRemovalWorkMaxValues[field],
  })
}
