import { describe, expect, it } from 'vitest'

import { collectDynamicConfigReferences } from './dynamic-configs.mts'

describe('collectDynamicConfigReferences', () => {
  it('collects DynamicConfig key as definition', () => {
    expect(
      collectDynamicConfigReferences(
        'backend/services/example/config.mts',
        "new DynamicConfig({ key: 'example-ns', fieldTypes: {}, defaultFields: {} })\n",
      ),
    ).toContainEqual({ namespace: 'example-ns', kind: 'definition' })
  })

  it('collects namespace from registry.mts as registration', () => {
    expect(
      collectDynamicConfigReferences(
        'backend/services/dynamic-config-admin/registry.mts',
        "[{ namespace: 'example-ns' }]\n",
      ),
    ).toContainEqual({ namespace: 'example-ns', kind: 'registry' })
  })

  it('collects namespace from registry-*.mts sidecar files as registration', () => {
    expect(
      collectDynamicConfigReferences(
        'backend/services/dynamic-config-admin/registry-cost-toggles.mts',
        "export const ENTRIES = [{ namespace: 'sidecar-ns' }]\n",
      ),
    ).toContainEqual({ namespace: 'sidecar-ns', kind: 'registry' })
  })

  it('collects namespace from descriptor registry entries as registration', () => {
    expect(
      collectDynamicConfigReferences(
        'backend/services/dynamic-config-admin/registry-entries.mts',
        "defineDynamicConfigNamespace({ namespace: 'descriptor-ns', fields: {} })\n",
      ),
    ).toContainEqual({ namespace: 'descriptor-ns', kind: 'registry' })
  })

  it('skips non-.mts files', () => {
    expect(
      collectDynamicConfigReferences(
        'backend/services/example/config.ts',
        "new DynamicConfig({ key: 'skip-ts', fieldTypes: {}, defaultFields: {} })\n",
      ),
    ).toEqual([])
  })

  it('skips .test.mts files', () => {
    expect(
      collectDynamicConfigReferences(
        'backend/services/example/config.test.mts',
        "new DynamicConfig({ key: 'skip-test', fieldTypes: {}, defaultFields: {} })\n",
      ),
    ).toEqual([])
  })
})
