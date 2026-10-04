import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const additionalDefaults = {
  delivery_lease_minutes: 15,
  screening_lease_minutes: 15,
}
export const copyrightNoticesAdditionalMaxValues = {
  delivery_lease_minutes: 360,
  screening_lease_minutes: 360,
}

export const copyrightSweepConfig = new DynamicConfig({
  key: 'copyright-notices-work-config',
  fieldTypes: {
    batch_size: 'number',
    max_batches_per_run: 'number',
    delivery_lease_minutes: 'number',
    screening_lease_minutes: 'number',
  },
  defaultFields: { batch_size: 100, max_batches_per_run: 20, ...additionalDefaults },
})

export function getCopyrightSweepLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(copyrightSweepConfig, 'batch_size', {
      defaultValue: 100,
      maxValue: 100,
    }),
    maxBatches: getBoundedPositiveIntegerField(copyrightSweepConfig, 'max_batches_per_run', {
      defaultValue: 20,
      maxValue: 2000,
    }),
  }
}

export function getCopyrightNoticesWorkLimit(field: keyof typeof additionalDefaults): number {
  return getBoundedPositiveIntegerField(copyrightSweepConfig, field, {
    defaultValue: additionalDefaults[field],
    maxValue: copyrightNoticesAdditionalMaxValues[field],
  })
}
