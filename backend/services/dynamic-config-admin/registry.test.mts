import { describe, expect, it } from 'vitest'
import { dynamicConfigRegistry } from './registry.mts'
import type { DynamicConfigRegistryEntry } from '@vouchington/dynamic-config'

describe('dynamic-config-admin registry completeness', () => {
  it('defines a complete namespace contract for every registered config', () => {
    const namespaces = new Set<string>()
    const configKeys = new Set<string>()

    for (const entry of dynamicConfigRegistry.entries) {
      const configKey = entry.config.key
      expect(configKey.slice('dynamic-config:'.length)).toBe(entry.namespace)
      expect(entry.namespace).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(entry.label.trim()).not.toBe('')
      expect(entry.description.trim()).not.toBe('')
      expect(Array.isArray(entry.access.update_roles)).toBe(true)
      expect(namespaces.has(entry.namespace)).toBe(false)
      expect(configKeys.has(configKey)).toBe(false)
      namespaces.add(entry.namespace)
      configKeys.add(configKey)
      expectFieldMetadata(entry)
    }
  })

  it('documents a maximum or exemption for every admin-exposed numeric field', () => {
    const missingMaxPolicy: string[] = []

    for (const entry of dynamicConfigRegistry.entries) {
      for (const [name, rawType] of Object.entries(entry.config.fieldTypes)) {
        if (rawType !== 'number') continue
        const fields = entry.fields as Record<
          string,
          { maxValue?: number; maxValueExemption?: string } | undefined
        >
        const metadata = fields[name]
        if (metadata?.maxValue !== undefined) continue
        if (metadata?.maxValueExemption?.trim()) continue
        missingMaxPolicy.push(`${entry.namespace}.${name}`)
      }
    }

    expect(missingMaxPolicy).toEqual([])
  })
})

function expectFieldMetadata(entry: DynamicConfigRegistryEntry): void {
  const fieldNames = Object.keys(entry.config.fieldTypes)
  const defaultFieldNames = Object.keys(entry.config.defaultFields)
  expect(defaultFieldNames.toSorted()).toEqual(fieldNames.toSorted())

  const metadata = entry.fields
  expect(Object.keys(metadata).toSorted()).toEqual(fieldNames.toSorted())
  const numericFieldsMissingValidation: string[] = []

  for (const name of fieldNames) {
    const rawType = entry.config.fieldTypes[name]
    expect(rawType === 'boolean' || rawType === 'number' || rawType === 'string').toBe(true)
    expect(typeof entry.config.defaultFields[name]).toBe(rawType)

    const fieldMetadata = metadata[name]
    expect(fieldMetadata?.description?.trim()).toBeTruthy()
    if (
      rawType === 'number' &&
      !entry.validate &&
      fieldMetadata?.minValue === undefined &&
      fieldMetadata?.maxValue === undefined &&
      fieldMetadata?.maxValueExemption === undefined &&
      fieldMetadata?.integer !== true
    ) {
      numericFieldsMissingValidation.push(name)
    }
  }

  expect(numericFieldsMissingValidation).toEqual([])
}
