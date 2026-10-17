import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  archive_backfill_day_page_size: 30,
}

/** Hard ceilings for the current runtime configuration contract. */
export const sitemapsWorkMaxValues = {
  archive_backfill_day_page_size: 366,
}

export const sitemapsWorkConfig = new DynamicConfig({
  key: 'sitemaps-work-config',
  fieldTypes: {
    archive_backfill_day_page_size: 'number',
  },
  defaultFields,
})

export function getSitemapsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(sitemapsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: sitemapsWorkMaxValues[field],
  })
}
