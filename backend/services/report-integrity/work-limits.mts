import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  backfill_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const reportIntegrityWorkMaxValues = {
  backfill_batch_size: 5000,
}

export const reportIntegrityWorkConfig = new DynamicConfig({
  key: 'report-integrity-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
  },
  defaultFields,
})

export function getReportIntegrityWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(reportIntegrityWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: reportIntegrityWorkMaxValues[field],
  })
}
