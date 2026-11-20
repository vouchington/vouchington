import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  max_candidates: 10,
  max_applied_topic_names: 50,
}

/** Hard ceilings for the current runtime configuration contract. */
export const autotaggerAgentWorkMaxValues = {
  max_candidates: 100,
  max_applied_topic_names: 500,
}

export const autotaggerAgentWorkConfig = new DynamicConfig({
  key: 'autotagger-agent-work-config',
  fieldTypes: {
    max_candidates: 'number',
    max_applied_topic_names: 'number',
  },
  defaultFields,
})

export function getAutotaggerAgentWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(autotaggerAgentWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: autotaggerAgentWorkMaxValues[field],
  })
}
