import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = { reconcile_max_pages_per_run: 10, retained_failed_job_scan_limit: 1000 }

export const sesInboundWorkConfig = new DynamicConfig({
  key: 'ses-inbound-work-config',
  fieldTypes: { reconcile_max_pages_per_run: 'number', retained_failed_job_scan_limit: 'number' },
  defaultFields,
})

export const sesInboundWorkMaxValues = {
  reconcile_max_pages_per_run: 100,
  retained_failed_job_scan_limit: 10000,
}

export function getSesInboundReconcileMaxPagesPerRun(): number {
  return getBoundedPositiveIntegerField(sesInboundWorkConfig, 'reconcile_max_pages_per_run', {
    defaultValue: defaultFields.reconcile_max_pages_per_run,
    maxValue: sesInboundWorkMaxValues.reconcile_max_pages_per_run,
  })
}

export function getSesInboundRetainedFailedJobScanLimit(): number {
  return getBoundedPositiveIntegerField(sesInboundWorkConfig, 'retained_failed_job_scan_limit', {
    defaultValue: defaultFields.retained_failed_job_scan_limit,
    maxValue: sesInboundWorkMaxValues.retained_failed_job_scan_limit,
  })
}

export const SES_INBOUND_RECONCILE_INTERVAL_MS = 5 * 60_000
