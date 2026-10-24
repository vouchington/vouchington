import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  archive_backfill_day_page_size: 30,
  generation_page_row_limit: 1000,
  weekly_backfill_days: 30,
  retired_generation_grace_seconds: 7 * 24 * 60 * 60,
  retired_generation_delete_page_size: 500,
  retired_generation_record_scan_limit: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const sitemapsWorkMaxValues = {
  archive_backfill_day_page_size: 366,
  generation_page_row_limit: 10000,
  weekly_backfill_days: 366,
  retired_generation_grace_seconds: 30 * 24 * 60 * 60,
  retired_generation_delete_page_size: 1000,
  retired_generation_record_scan_limit: 1000,
}

// Edge sitemap entries can live for one day, then a two-day stale window and a
// one-day stale-if-error allowance. The Worker caps the configurable TTL.
export const MIN_RETIRED_GENERATION_GRACE_SECONDS = 4 * 24 * 60 * 60

export const sitemapsWorkConfig = new DynamicConfig({
  key: 'sitemaps-work-config',
  fieldTypes: {
    archive_backfill_day_page_size: 'number',
    generation_page_row_limit: 'number',
    weekly_backfill_days: 'number',
    retired_generation_grace_seconds: 'number',
    retired_generation_delete_page_size: 'number',
    retired_generation_record_scan_limit: 'number',
  },
  defaultFields,
})

export function getSitemapsWorkLimit(field: keyof typeof defaultFields): number {
  const value = getBoundedPositiveIntegerField(sitemapsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: sitemapsWorkMaxValues[field],
  })
  return field === 'retired_generation_grace_seconds'
    ? Math.max(MIN_RETIRED_GENERATION_GRACE_SECONDS, value)
    : value
}
