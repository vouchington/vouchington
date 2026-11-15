import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const voteDriftQueueConfig = new DynamicConfig({
  key: 'vote-drift-queue-config',
  fieldTypes: { concurrency: 'number' },
  defaultFields: { concurrency: 1 },
})
export const VOTE_DRIFT_CONCURRENCY_MAX = 1
export function getVoteDriftOrderingConcurrency(): number {
  return getBoundedPositiveIntegerField(voteDriftQueueConfig, 'concurrency', {
    defaultValue: 1,
    maxValue: VOTE_DRIFT_CONCURRENCY_MAX,
  })
}
