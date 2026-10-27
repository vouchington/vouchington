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

export const psqlQueueConfig = new DynamicConfig({
  key: 'psql-queue-config',
  fieldTypes: orderingFields.fieldTypes,
  defaultFields: orderingFields.defaultFields,
})

export const psqlQueueMaxValues = orderingFields.maxValues
export const psqlQueueDescriptions = orderingFields.descriptions

export function getAIRetentionOrderingConcurrency(family: AIRetentionFamily): number {
  const field = orderingConfigField(aiRetentionOrderingKey(family))
  return getBoundedPositiveIntegerField(psqlQueueConfig, field, {
    defaultValue: 1,
    maxValue: psqlQueueMaxValues[field]!,
  })
}
