import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const sesInboundWorkConfig = new DynamicConfig({
  key: 'ses-inbound-work-config',
  fieldTypes: { reconcile_max_pages_per_run: 'number', retained_failed_job_scan_limit: 'number' },
  defaultFields: { reconcile_max_pages_per_run: 10, retained_failed_job_scan_limit: 1000 },
})

export const sesInboundWorkMaxValues = {
  reconcile_max_pages_per_run: 100,
  retained_failed_job_scan_limit: 10000,
}

export function getSesInboundReconcileMaxPagesPerRun(): number {
  return getBoundedPositiveIntegerField(sesInboundWorkConfig, 'reconcile_max_pages_per_run', {
    defaultValue: 10,
    maxValue: 100,
  })
}

export function getSesInboundRetainedFailedJobScanLimit(): number {
  return getBoundedPositiveIntegerField(sesInboundWorkConfig, 'retained_failed_job_scan_limit', {
    defaultValue: 1000,
    maxValue: sesInboundWorkMaxValues.retained_failed_job_scan_limit,
  })
}

export const SES_INBOUND_RECONCILE_INTERVAL_MS = 5 * 60_000
