import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const voteWeightWorkConfig = new DynamicConfig({
  key: 'vote-weight-work-config',
  fieldTypes: { dispatch_batch_size: 'number' },
  defaultFields: { dispatch_batch_size: 500 },
})
export const voteWeightWorkMaxValues = { dispatch_batch_size: 5000 }
export function getVoteWeightDispatchBatchSize(): number {
  return getBoundedPositiveIntegerField(voteWeightWorkConfig, 'dispatch_batch_size', {
    defaultValue: 500,
    maxValue: 5000,
  })
}
