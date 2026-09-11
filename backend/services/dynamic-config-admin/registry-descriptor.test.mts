import { describe, expect, it } from 'vitest'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import type { DynamicConfigFieldType, DynamicConfigRegistryEntry } from './types.mts'

describe('defineDynamicConfigNamespace', () => {
  it('rejects descriptors missing field metadata', () => {
    expect(() =>
      defineDynamicConfigNamespace(
        createDescriptor({
          fieldTypes: {
            enabled: 'boolean',
            threshold: 'number',
          },
          fields: {
            enabled: { description: 'Enable test config.' },
          },
        }),
      ),
    ).toThrow('DynamicConfig metadata drift for test-config: missing metadata: threshold')
  })

  it('rejects descriptors with extra field metadata', () => {
    expect(() =>
      defineDynamicConfigNamespace(
        createDescriptor({
          fieldTypes: {
            enabled: 'boolean',
          },
          fields: {
            enabled: { description: 'Enable test config.' },
            removed: { description: 'Removed field.' },
          },
        }),
      ),
    ).toThrow('DynamicConfig metadata drift for test-config: extra metadata: removed')
  })
})

function createDescriptor(input: {
  fieldTypes: Record<string, DynamicConfigFieldType>
  fields: DynamicConfigRegistryEntry['fields']
}): DynamicConfigRegistryEntry {
  return {
    namespace: 'test-config',
    label: 'Test Config',
    description: 'Test-only dynamic config registry entry.',
    access: {
      update_roles: [],
    },
    fields: input.fields,
    config: {
      key: 'dynamic-config:test-config',
      fieldTypes: input.fieldTypes,
      defaultFields: Object.fromEntries(
        Object.entries(input.fieldTypes).map(([name, type]) => [
          name,
          type === 'boolean' ? true : 1,
        ]),
      ),
      fields: new Map(),
      waitForInitialization: async () => {},
      close: async () => {},
      getFields: () => ({}),
      setFields: async () => {},
    },
  }
}
