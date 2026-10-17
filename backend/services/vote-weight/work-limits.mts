import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const voteWeightWorkConfig = new DynamicConfig({
  key: 'vote-weight-work-config',
  fieldTypes: {
    dispatch_batch_size: 'number',
    election_fan_out_page_size: 'number',
    window_overlap_seconds: 'number',
  },
  defaultFields: {
    dispatch_batch_size: 500,
    election_fan_out_page_size: 500,
    window_overlap_seconds: 120,
  },
})
export const voteWeightWorkMaxValues = {
  window_overlap_seconds: 3600,
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

export function getVoteWeightWindowOverlapSeconds(): number {
  return getBoundedPositiveIntegerField(voteWeightWorkConfig, 'window_overlap_seconds', {
    defaultValue: 120,
    maxValue: 3600,
  })
}
