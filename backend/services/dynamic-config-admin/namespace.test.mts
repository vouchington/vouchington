import { describe, expect, it } from 'vitest'
import { assertPlainChanges, normalizeFields, toNamespace, validateChanges } from './namespace.mts'
import type {
  DynamicConfigFieldType,
  DynamicConfigFields,
  DynamicConfigRegistryEntry,
  DynamicConfigUser,
} from './types.mts'

describe('dynamic-config-admin namespace helpers', () => {
  const adminUser: DynamicConfigUser = {
    id: 'user_admin',
    roles: ['administrator'],
  }

  it('rejects missing or non-object change payloads', () => {
    expect(() => assertPlainChanges(null as unknown as Record<string, unknown>)).toThrow(
      'Missing config object',
    )
    expect(() => assertPlainChanges([] as unknown as Record<string, unknown>)).toThrow(
      'Missing config object',
    )
  })

  it('rejects unknown, non-finite, and non-safe-integer field updates', () => {
    const entry = createRegistryEntry({
      fieldTypes: {
        enabled: 'boolean',
        threshold: 'number',
        count: 'number',
      },
      defaultFields: {
        enabled: true,
        threshold: 1,
        count: 2,
      },
      fields: {
        count: { integer: true },
      },
    })
    const previous = normalizeFields(entry, entry.config.defaultFields)

    expect(() => validateChanges(entry, previous, { missing: true })).toThrow(
      'Unknown config field: missing',
    )
    expect(() => validateChanges(entry, previous, { threshold: Number.NaN })).toThrow(
      'Field threshold must be a finite number',
    )
    expect(() => validateChanges(entry, previous, { count: 2.5 })).toThrow(
      'Field count must be a safe integer',
    )
    expect(() => validateChanges(entry, previous, { count: 2 ** 53 })).toThrow(
      'Field count must be a safe integer',
    )
  })

  it('renders and validates string fields correctly', () => {
    const entry = createRegistryEntry({
      fieldTypes: {
        mode: 'string',
      },
      defaultFields: {
        mode: 'enabled',
      },
    })

    const ns = toNamespace(adminUser, entry)
    expect(ns.config['mode']).toBe('enabled')
    expect(ns.fields[0]).toMatchObject({ name: 'mode', type: 'string', value: 'enabled' })

    const validated = validateChanges(entry, { mode: 'enabled' }, { mode: 'observe' })
    expect(validated).toEqual({ mode: 'observe' })
  })

  it('rejects non-string values for string fields and unsupported field types', () => {
    const entry = createRegistryEntry({
      fieldTypes: {
        mode: 'string',
      },
      defaultFields: {
        mode: 'enabled',
      },
    })

    expect(() => validateChanges(entry, { mode: 'enabled' }, { mode: 42 })).toThrow(
      'Field mode must be a string',
    )

    const badEntry = createRegistryEntry({
      fieldTypes: { x: 'object' },
      defaultFields: { x: {} },
    })
    expect(() => toNamespace(adminUser, badEntry)).toThrow(
      'Unsupported dynamic config field type for x: object',
    )
  })

  it('rejects invalid raw numeric fields while normalizing', () => {
    const entry = createRegistryEntry({
      fieldTypes: {
        threshold: 'number',
      },
      defaultFields: {
        threshold: Number.POSITIVE_INFINITY,
      },
    })

    expect(() => normalizeFields(entry, {})).toThrow('Invalid number config field threshold')
  })
})

function createRegistryEntry(input: {
  // Deliberately wider than DynamicConfigFieldType/DynamicConfigFields: some cases below feed an
  // unsupported field type ('object') to exercise namespace.mts's runtime defense against
  // malformed descriptors, which a narrower parameter type would reject at compile time.
  fieldTypes: Record<string, string>
  defaultFields: Record<string, unknown>
  fields?: DynamicConfigRegistryEntry['fields']
}): DynamicConfigRegistryEntry {
  const fields =
    input.fields ??
    Object.fromEntries(
      Object.keys(input.fieldTypes).map(name => [name, { description: `${name} field` }]),
    )
  const fieldTypes = input.fieldTypes as Record<string, DynamicConfigFieldType>
  const defaultFields = input.defaultFields as DynamicConfigFields
  return {
    namespace: 'test-config',
    label: 'Test Config',
    description: 'Test-only dynamic config registry entry.',
    access: {
      update_roles: [],
    },
    fields,
    config: {
      key: 'dynamic-config:test-config',
      fieldTypes,
      defaultFields,
      fields: new Map(),
      waitForInitialization: async () => {},
      close: async () => {},
      getFields: () => defaultFields,
      setFields: async () => {},
    },
  }
}
