import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = { retry_failed_limit: 100 }

export const queueMonitoringWorkMaxValues = { retry_failed_limit: 100 }

export const queueMonitoringWorkConfig = new DynamicConfig({
  key: 'queue-monitoring-work-config',
  fieldTypes: { retry_failed_limit: 'number' },
  defaultFields,
})

export function getQueueMonitoringRetryFailedLimit(): number {
  return getBoundedPositiveIntegerField(queueMonitoringWorkConfig, 'retry_failed_limit', {
    defaultValue: defaultFields.retry_failed_limit,
    maxValue: queueMonitoringWorkMaxValues.retry_failed_limit,
  })
}
