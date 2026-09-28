import { DYNAMIC_CONFIG_AUDIT_FIELD_TYPES } from '@data-stores/psql/dynamic-config-audit-schema'
import { describe, expect, it } from 'vitest'
import { dynamicConfigRegistryEntries } from './registry-entries.mts'

describe('dynamic config audit schema', () => {
  it('matches every registered namespace field type', () => {
    const fromRegistry = Object.fromEntries(
      dynamicConfigRegistryEntries.map(entry => [entry.namespace, entry.config.fieldTypes]),
    )
    expect(DYNAMIC_CONFIG_AUDIT_FIELD_TYPES).toEqual(fromRegistry)
  })
})
