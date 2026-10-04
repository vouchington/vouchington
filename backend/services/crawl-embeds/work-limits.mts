import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  backfill_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const crawlEmbedsWorkMaxValues = {
  backfill_batch_size: 5000,
}

export const crawlEmbedsWorkConfig = new DynamicConfig({
  key: 'crawl-embeds-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
  },
  defaultFields,
})

export function getCrawlEmbedsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(crawlEmbedsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: crawlEmbedsWorkMaxValues[field],
  })
}
