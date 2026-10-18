import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const voteWeightWorkConfig = new DynamicConfig({
  key: 'vote-weight-work-config',
  fieldTypes: {
    dispatch_batch_size: 'number',
    age_milestones_lookback_seconds: 'number',
    membership_expirations_lookback_seconds: 'number',
    family_source_changes_lookback_seconds: 'number',
  },
  defaultFields: {
    dispatch_batch_size: 500,
    age_milestones_lookback_seconds: 86400,
    membership_expirations_lookback_seconds: 86400,
    family_source_changes_lookback_seconds: 86400,
  },
})
export const voteWeightWorkMaxValues = {
  age_milestones_lookback_seconds: 31536000,
  membership_expirations_lookback_seconds: 31536000,
  family_source_changes_lookback_seconds: 31536000,
  dispatch_batch_size: 5000,
}
export function getVoteWeightDispatchBatchSize(): number {
  return getBoundedPositiveIntegerField(voteWeightWorkConfig, 'dispatch_batch_size', {
    defaultValue: 500,
    maxValue: 5000,
  })
}
export function getVoteWeightLookbackSeconds(
  signal: 'age_milestones' | 'membership_expirations' | 'family_source_changes',
): number {
  const field = `${signal}_lookback_seconds` as const
  return getBoundedPositiveIntegerField(voteWeightWorkConfig, field, {
    defaultValue: 86400,
    maxValue: voteWeightWorkMaxValues[field],
  })
}
