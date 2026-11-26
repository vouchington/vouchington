import { describe, expect, it } from 'vitest'
// oxlint-disable-next-line no-restricted-imports -- The hook targets the raw valkyries class.
import { DynamicConfig as RawDynamicConfig } from 'valkyries/dynamic-config'
import { overrideDynamicConfigFieldsForTest, type TestDynamicConfig } from './dynamic-config.mts'

/** Mirrors valkyries' `refresh()` write loop without a Valkey connection. */
class RefreshableConfig implements TestDynamicConfig {
  key = 'dynamic-config:refreshable'
  fieldTypes = { limit: 'number', label: 'string' } as TestDynamicConfig['fieldTypes']
  defaultFields = { limit: 5, label: 'default' }
  fields = new Map<string, boolean | number | string>(Object.entries(this.defaultFields))

  refresh(): Promise<void> {
    return this.applyFieldsFromMap({}, new Set())
  }

  private applyFieldsFromMap(_fieldsMap: unknown, skipFieldNames: Set<string>): Promise<void> {
    for (const [name, value] of Object.entries(this.defaultFields)) {
      if (!skipFieldNames.has(name)) this.fields.set(name, value)
    }
    return Promise.resolve()
  }
}

describe('DynamicConfig test overrides across refresh()', () => {
  it('targets the method valkyries refresh() really calls', () => {
    expect(
      typeof (RawDynamicConfig.prototype as object as Record<string, unknown>).applyFieldsFromMap,
    ).toBe('function')
  })

  it('keeps an override through refresh() until it is disposed', async () => {
    const config = new RefreshableConfig()
    const restore = overrideDynamicConfigFieldsForTest(config, { limit: 8 })

    await config.refresh()
    expect(config.fields.get('limit')).toBe(8)

    restore()
    expect(config.fields.get('limit')).toBe(5)
    await config.refresh()
    expect(config.fields.get('limit')).toBe(5)
  })

  it('fails with a clear cause when refresh() has no applyFieldsFromMap to hook', () => {
    const config = { ...new RefreshableConfig(), refresh: () => Promise.resolve() }

    expect(() => overrideDynamicConfigFieldsForTest(config, { limit: 8 })).toThrow(
      'applyFieldsFromMap',
    )
  })
})
