import { DynamicConfig } from '@data-stores/valkey'

export const AGENT_RESPONSE_QUOTA_CONFIG_KEY = 'agent-response-quotas'

export const agentResponseQuotaConfig = new DynamicConfig({
  key: AGENT_RESPONSE_QUOTA_CONFIG_KEY,
  fieldTypes: {
    free_daily: 'number',
    plus_daily: 'number',
    pro_daily: 'number',
    max_concurrent: 'number',
    enabled: 'boolean',
  },
  defaultFields: {
    free_daily: 10,
    plus_daily: 100,
    pro_daily: 500,
    max_concurrent: 4,
    enabled: true,
  },
})

export function getAgentResponseQuotaFields(): {
  free_daily: number
  plus_daily: number
  pro_daily: number
  max_concurrent: number
  enabled: boolean
} {
  const fields = agentResponseQuotaConfig.getFields()
  return {
    free_daily: (fields['free_daily'] as number | undefined) ?? 10,
    plus_daily: (fields['plus_daily'] as number | undefined) ?? 100,
    pro_daily: (fields['pro_daily'] as number | undefined) ?? 500,
    max_concurrent: (fields['max_concurrent'] as number | undefined) ?? 4,
    enabled: (fields['enabled'] as boolean | undefined) ?? true,
  }
}
