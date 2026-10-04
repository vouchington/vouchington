import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const additionalDefaults = {
  dispatch_timeout_minutes: 5,
  processing_timeout_minutes: 30,
}
export const accountDataRequestsAdditionalMaxValues = {
  dispatch_timeout_minutes: 120,
  processing_timeout_minutes: 720,
}

export const dataRequestConfig = new DynamicConfig({
  key: 'account-data-requests-work-config',
  fieldTypes: {
    batch_size: 'number',
    max_batches_per_run: 'number',
    dispatch_timeout_minutes: 'number',
    processing_timeout_minutes: 'number',
  },
  defaultFields: { batch_size: 500, max_batches_per_run: 20, ...additionalDefaults },
})

export function getDataRequestLimits() {
  return {
    batchSize: getBoundedPositiveIntegerField(dataRequestConfig, 'batch_size', {
      defaultValue: 500,
      maxValue: 5000,
    }),
    maxBatches: getBoundedPositiveIntegerField(dataRequestConfig, 'max_batches_per_run', {
      defaultValue: 20,
      maxValue: 2000,
    }),
  }
}

export function getAccountDataRequestsWorkLimit(field: keyof typeof additionalDefaults): number {
  return getBoundedPositiveIntegerField(dataRequestConfig, field, {
    defaultValue: additionalDefaults[field],
    maxValue: accountDataRequestsAdditionalMaxValues[field],
  })
}
