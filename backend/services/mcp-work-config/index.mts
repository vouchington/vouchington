import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const mcpToolsWorkMaxValues = { max_audited_messages: 25 } as const

export const mcpToolsWorkConfig = new DynamicConfig({
  key: 'mcp-tools-work-config',
  fieldTypes: { max_audited_messages: 'number' },
  defaultFields: mcpToolsWorkMaxValues,
})

export function getMcpAuditMessageLimit(): number {
  return getBoundedPositiveIntegerField(mcpToolsWorkConfig, 'max_audited_messages', {
    defaultValue: mcpToolsWorkMaxValues.max_audited_messages,
    maxValue: mcpToolsWorkMaxValues.max_audited_messages,
  })
}
