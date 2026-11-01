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
const OPERATIONAL_TOMBSTONE_CONCURRENCY_FIELD = 'operational_tombstone_retention_concurrency'
const COPYRIGHT_CASE_PURGE_CONCURRENCY_FIELD = 'copyright_case_purge_concurrency'
const COPYRIGHT_CASE_PURGE_PAGE_SIZE_FIELD = 'copyright_case_purge_page_size'

export const psqlQueueConfig = new DynamicConfig({
  key: 'psql-queue-config',
  fieldTypes: {
    ...orderingFields.fieldTypes,
    [TERMINAL_CONCURRENCY_FIELD]: 'number',
    [OPERATIONAL_TOMBSTONE_CONCURRENCY_FIELD]: 'number',
    [COPYRIGHT_CASE_PURGE_CONCURRENCY_FIELD]: 'number',
    [COPYRIGHT_CASE_PURGE_PAGE_SIZE_FIELD]: 'number',
  },
  defaultFields: {
    ...orderingFields.defaultFields,
    [TERMINAL_CONCURRENCY_FIELD]: 1,
    [OPERATIONAL_TOMBSTONE_CONCURRENCY_FIELD]: 1,
    [COPYRIGHT_CASE_PURGE_CONCURRENCY_FIELD]: 1,
    [COPYRIGHT_CASE_PURGE_PAGE_SIZE_FIELD]: 100,
  },
})

export const psqlQueueMaxValues: Record<string, number> = {
  ...orderingFields.maxValues,
  [TERMINAL_CONCURRENCY_FIELD]: TERMINAL_ACTIVITY_RETENTION_ORDERING_MAX,
  [OPERATIONAL_TOMBSTONE_CONCURRENCY_FIELD]: 1,
  [COPYRIGHT_CASE_PURGE_CONCURRENCY_FIELD]: 1,
  [COPYRIGHT_CASE_PURGE_PAGE_SIZE_FIELD]: 100,
}
export const psqlQueueDescriptions = {
  ...orderingFields.descriptions,
  [TERMINAL_CONCURRENCY_FIELD]:
    'Global concurrent retained jobs per terminal Follow or Like family.',
  [OPERATIONAL_TOMBSTONE_CONCURRENCY_FIELD]:
    'Global concurrent retained jobs per operational tombstone family.',
  [COPYRIGHT_CASE_PURGE_CONCURRENCY_FIELD]: 'Global concurrent purge jobs for each copyright case.',
  [COPYRIGHT_CASE_PURGE_PAGE_SIZE_FIELD]:
    'Maximum indexed copyright case or account clock rows handled by one retained job run.',
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

export function getCopyrightCasePurgeConcurrency(): number {
  return getBoundedPositiveIntegerField(psqlQueueConfig, COPYRIGHT_CASE_PURGE_CONCURRENCY_FIELD, {
    defaultValue: 1,
    maxValue: 1,
  })
}

export function getCopyrightCasePurgePageSize(): number {
  return getBoundedPositiveIntegerField(psqlQueueConfig, COPYRIGHT_CASE_PURGE_PAGE_SIZE_FIELD, {
    defaultValue: 100,
    maxValue: 100,
  })
}
