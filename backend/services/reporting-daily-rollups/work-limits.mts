import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const reportingRollupWorkConfig = new DynamicConfig({
  key: 'reporting-rollup-work-config',
  fieldTypes: { days_per_job: 'number', cleanup_rows: 'number' },
  defaultFields: { days_per_job: 1, cleanup_rows: 1000 },
})
export const reportingRollupWorkMaxValues = { days_per_job: 7, cleanup_rows: 10000 }
export function getReportingDaysPerJob() {
  return getBoundedPositiveIntegerField(reportingRollupWorkConfig, 'days_per_job', {
    defaultValue: 1,
    maxValue: reportingRollupWorkMaxValues.days_per_job,
  })
}

export function getReportingCleanupRows() {
  return getBoundedPositiveIntegerField(reportingRollupWorkConfig, 'cleanup_rows', {
    defaultValue: 1000,
    maxValue: reportingRollupWorkMaxValues.cleanup_rows,
  })
}
