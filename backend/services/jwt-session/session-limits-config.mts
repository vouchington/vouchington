import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = { active_sessions_per_user: 100 }

export const sessionLimitsMaxValues = { active_sessions_per_user: 1_000 }

export const sessionLimitsConfig = new DynamicConfig({
  key: 'session-limits-config',
  fieldTypes: { active_sessions_per_user: 'number' },
  defaultFields,
})

export function getActiveUserSessionLimit(): number {
  return getBoundedPositiveIntegerField(sessionLimitsConfig, 'active_sessions_per_user', {
    defaultValue: defaultFields.active_sessions_per_user,
    maxValue: sessionLimitsMaxValues.active_sessions_per_user,
  })
}
