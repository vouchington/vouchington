import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const sesInboundWorkConfig = new DynamicConfig({
  key: 'ses-inbound-work-config',
  fieldTypes: { reconcile_max_pages_per_run: 'number' },
  defaultFields: { reconcile_max_pages_per_run: 10 },
})

export const sesInboundWorkMaxValues = { reconcile_max_pages_per_run: 100 }

export function getSesInboundReconcileMaxPagesPerRun(): number {
  return getBoundedPositiveIntegerField(sesInboundWorkConfig, 'reconcile_max_pages_per_run', {
    defaultValue: 10,
    maxValue: 100,
  })
}
