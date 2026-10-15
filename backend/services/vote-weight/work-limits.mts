import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const voteWeightWorkConfig = new DynamicConfig({
  key: 'vote-weight-work-config',
  fieldTypes: { dispatch_batch_size: 'number', election_fan_out_page_size: 'number' },
  defaultFields: { dispatch_batch_size: 500, election_fan_out_page_size: 500 },
})
export const voteWeightWorkMaxValues = {
  dispatch_batch_size: 5000,
  election_fan_out_page_size: 5000,
}
export function getVoteWeightDispatchBatchSize(): number {
  return getBoundedPositiveIntegerField(voteWeightWorkConfig, 'dispatch_batch_size', {
    defaultValue: 500,
    maxValue: 5000,
  })
}
/** Votes of one user turned into election recomputes by a single fan-out job. */
export function getVoteWeightElectionFanOutPageSize(): number {
  return getBoundedPositiveIntegerField(voteWeightWorkConfig, 'election_fan_out_page_size', {
    defaultValue: 500,
    maxValue: 5000,
  })
}
