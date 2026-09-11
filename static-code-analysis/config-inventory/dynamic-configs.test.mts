import { describe, expect, it } from 'vitest'

import { collectDynamicConfigsFromFile, mergeDynamicConfigRows } from './dynamic-configs.mts'

describe('collectDynamicConfigsFromFile', () => {
  it('collects DynamicConfig key as definition', () => {
    const defs = new Map<string, Set<string>>()
    const reg = new Map<string, Set<string>>()
    collectDynamicConfigsFromFile(
      'backend/services/example/config.mts',
      "new DynamicConfig({ key: 'example-ns', fieldTypes: {}, defaultFields: {} })\n",
      defs,
      reg,
    )
    expect(defs.has('example-ns')).toBe(true)
    expect(reg.has('example-ns')).toBe(false)
  })

  it('collects namespace from registry.mts as registration', () => {
    const defs = new Map<string, Set<string>>()
    const reg = new Map<string, Set<string>>()
    collectDynamicConfigsFromFile(
      'backend/services/dynamic-config-admin/registry.mts',
      "[{ namespace: 'example-ns' }]\n",
      defs,
      reg,
    )
    expect(reg.has('example-ns')).toBe(true)
  })

  it('collects namespace from registry-*.mts sidecar files as registration', () => {
    const defs = new Map<string, Set<string>>()
    const reg = new Map<string, Set<string>>()
    collectDynamicConfigsFromFile(
      'backend/services/dynamic-config-admin/registry-cost-toggles.mts',
      "export const ENTRIES = [{ namespace: 'sidecar-ns' }]\n",
      defs,
      reg,
    )
    expect(reg.has('sidecar-ns')).toBe(true)
    expect(defs.has('sidecar-ns')).toBe(false)
  })

  it('collects namespace from descriptor registry entries as registration', () => {
    const defs = new Map<string, Set<string>>()
    const reg = new Map<string, Set<string>>()
    collectDynamicConfigsFromFile(
      'backend/services/dynamic-config-admin/registry-entries.mts',
      "defineDynamicConfigNamespace({ namespace: 'descriptor-ns', fields: {} })\n",
      defs,
      reg,
    )
    expect(reg.has('descriptor-ns')).toBe(true)
  })

  it('skips non-.mts files', () => {
    const defs = new Map<string, Set<string>>()
    const reg = new Map<string, Set<string>>()
    collectDynamicConfigsFromFile(
      'backend/services/example/config.ts',
      "new DynamicConfig({ key: 'skip-ts', fieldTypes: {}, defaultFields: {} })\n",
      defs,
      reg,
    )
    expect(defs.has('skip-ts')).toBe(false)
  })

  it('skips .test.mts files', () => {
    const defs = new Map<string, Set<string>>()
    const reg = new Map<string, Set<string>>()
    collectDynamicConfigsFromFile(
      'backend/services/example/config.test.mts',
      "new DynamicConfig({ key: 'skip-test', fieldTypes: {}, defaultFields: {} })\n",
      defs,
      reg,
    )
    expect(defs.has('skip-test')).toBe(false)
  })
})

describe('mergeDynamicConfigRows', () => {
  it('marks namespace as unregistered when only in definitions', () => {
    const defs = new Map([['unregistered', new Set(['some/config.mts'])]])
    const reg = new Map<string, Set<string>>()
    const rows = mergeDynamicConfigRows(defs, reg)
    expect(rows).toEqual([
      { namespace: 'unregistered', definitionFiles: ['some/config.mts'], registryFiles: [] },
    ])
  })

  it('marks namespace as registered when in both definitions and registry', () => {
    const defs = new Map([['registered', new Set(['some/config.mts'])]])
    const reg = new Map([['registered', new Set(['registry.mts'])]])
    const rows = mergeDynamicConfigRows(defs, reg)
    expect(rows).toEqual([
      {
        namespace: 'registered',
        definitionFiles: ['some/config.mts'],
        registryFiles: ['registry.mts'],
      },
    ])
  })
})
