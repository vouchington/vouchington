import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  engagement_claim_hours: 24,
  preservation_hold_history_limit: 100,
  content_removal_count_cap: 1000,
  topic_follow_context_count_cap: 99,
  topic_follow_context_inspect_limit: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const usersWorkMaxValues = {
  engagement_claim_hours: 576,
  preservation_hold_history_limit: 1000,
  content_removal_count_cap: 10_000,
  topic_follow_context_count_cap: 99,
  topic_follow_context_inspect_limit: 1000,
}

export const usersWorkConfig = new DynamicConfig({
  key: 'users-work-config',
  fieldTypes: {
    engagement_claim_hours: 'number',
    preservation_hold_history_limit: 'number',
    content_removal_count_cap: 'number',
    topic_follow_context_count_cap: 'number',
    topic_follow_context_inspect_limit: 'number',
  },
  defaultFields,
})

export function getUsersWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(usersWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: usersWorkMaxValues[field],
  })
}
