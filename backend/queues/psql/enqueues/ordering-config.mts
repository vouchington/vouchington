import { AI_RETENTION_FAMILIES, type AIRetentionFamily } from '../types.mts'
import { DynamicConfig } from '@data-stores/valkey'
import {
  orderingConfigField,
  orderingConfigFields,
} from '@data-stores/valkey-glide-mq/shared-queue-ordering'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const aiRetentionOrderingKey = (family: AIRetentionFamily): string =>
  `psql:ai-retention:${family}`

const orderingFields = orderingConfigFields(
  Object.fromEntries(AI_RETENTION_FAMILIES.map(family => [aiRetentionOrderingKey(family), 1])),
)

export const TERMINAL_ACTIVITY_RETENTION_ORDERING_MAX = 1
const TERMINAL_CONCURRENCY_FIELD = 'terminal_activity_retention_concurrency'

export const psqlQueueConfig = new DynamicConfig({
  key: 'psql-queue-config',
  fieldTypes: { ...orderingFields.fieldTypes, [TERMINAL_CONCURRENCY_FIELD]: 'number' },
  defaultFields: { ...orderingFields.defaultFields, [TERMINAL_CONCURRENCY_FIELD]: 1 },
})

export const psqlQueueMaxValues: Record<string, number> = {
  ...orderingFields.maxValues,
  [TERMINAL_CONCURRENCY_FIELD]: TERMINAL_ACTIVITY_RETENTION_ORDERING_MAX,
}
export const psqlQueueDescriptions = {
  ...orderingFields.descriptions,
  [TERMINAL_CONCURRENCY_FIELD]:
    'Global concurrent retained jobs per terminal Follow or Like family.',
}

export function getTerminalActivityRetentionConcurrency(): number {
  return getBoundedPositiveIntegerField(psqlQueueConfig, TERMINAL_CONCURRENCY_FIELD, {
    defaultValue: 1,
    maxValue: TERMINAL_ACTIVITY_RETENTION_ORDERING_MAX,
  })
}

export function getAIRetentionOrderingConcurrency(family: AIRetentionFamily): number {
  const field = orderingConfigField(aiRetentionOrderingKey(family))
  return getBoundedPositiveIntegerField(psqlQueueConfig, field, {
    defaultValue: 1,
    maxValue: psqlQueueMaxValues[field]!,
  })
}
